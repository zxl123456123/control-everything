"""Root-run HTTP admission checks, not registration, browser RPC or SSH/WS teardown proof.

Private JSON: origin; a/b each {cookie,sub,device_id,generation,bootstrap_csrf};
optional old_cookie_a, context_a, temporary_a_device_id. Obtain bootstrap_csrf
from each local instance independently. Never place cookies/tokens in arguments.
Default is non-destructive. Offline mode requires root to stop A beforehand.
Revocation requires both an explicit CLI device id and a matching private designation.
"""

import argparse
import http.client
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit

INTERNAL_HEADERS = {"x-ce-upstream", "x-ce-device-proof", "x-ce-route-proof"}


class AcceptanceFailure(Exception):
    pass


class Peer:
    def __init__(self, origin, account):
        self.origin, self.account = origin, account
        self.cookies = SimpleCookie(account["cookie"])
        self.context = None

    def request(self, path, *, headers=None, cookie=None, body=None, timeout=5):
        authority = urlsplit(self.origin).netloc
        connection = http.client.HTTPSConnection(authority, timeout=timeout)
        values = {"Cookie": cookie if cookie is not None else "; ".join(f"{key}={item.value}" for key, item in self.cookies.items()),
                  "Origin": self.origin, **(headers or {})}
        if body is not None:
            values["Content-Type"] = "application/json"
        try:
            connection.request("POST" if body is not None else "GET", path,
                               json.dumps(body) if body is not None else None, values)
            response = connection.getresponse()
            raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise AcceptanceFailure("response_too_large")
            returned = response.getheaders()
            if INTERNAL_HEADERS.intersection(key.lower() for key, _ in returned):
                raise AcceptanceFailure("public_internal_header_leak")
            if cookie is None:
                for key, value in returned:
                    if key.lower() == "set-cookie":
                        self.cookies.load(value)
            return response.status, raw, returned
        finally:
            connection.close()


def run(config, report, *, offline=False, revoke=None):
    def check(name, condition):
        report["checks"].append({"case": name, "status": "pass" if condition else "fail"})
        if not condition:
            raise AcceptanceFailure(name)
    check("different_accounts_and_devices", config["a"]["sub"] != config["b"]["sub"]
          and config["a"]["device_id"] != config["b"]["device_id"])
    for label in ("a", "b"):
        account = config[label]
        check(label + "_private_input_shape", isinstance(account.get("device_id"), str)
              and re.fullmatch(r"[a-f0-9]{24}", account["device_id"]) is not None
              and type(account.get("generation")) is int and account["generation"] > 0
              and all(isinstance(account.get(key), str) and account[key]
                      and "\r" not in account[key] and "\n" not in account[key] for key in ("cookie", "sub", "bootstrap_csrf")))
    if revoke:
        check("explicit_temporary_a_only", not offline and revoke == config["a"]["device_id"]
              == config.get("temporary_a_device_id"))
    peers = {label: Peer(config["origin"], config[label]) for label in ("a", "b")}
    sessions = {}
    def session(label):
        status, raw, _ = peers[label].request("/remote/api/session")
        check(label + "_session_authenticated", status == 200)
        value = json.loads(raw)
        check(label + "_session_subject", value.get("account", {}).get("sub") == config[label]["sub"])
        return value
    def bootstrap(label, **options):
        headers = {"X-CE-Context": peers[label].context, **options.pop("headers", {})}
        return peers[label].request("/api/bootstrap", headers=headers, **options)
    def routed(label, **options):
        status, raw, _ = bootstrap(label, **options)
        check(label + "_local_instance_routed", status == 200
              and json.loads(raw).get("csrf_token") == config[label]["bootstrap_csrf"])
    for label, peer in peers.items():
        sessions[label] = value = session(label)
        device = value.get("device") or {}
        check(label + "_own_device", value.get("membership") == "active"
              and device.get("device_id") == config[label]["device_id"]
              and device.get("generation") == config[label]["generation"])
        check(label + "_expected_state", device.get("state") == ("offline" if label == "a" and offline else "online"))
        status, raw, _ = peer.request("/studio")
        if label == "a" and offline:
            check("offline_a_document_no_fallback", status == 503)
            peer.context = config.get("context_a")
        else:
            match = re.search(rb'<meta name="ce-remote-context" content="([A-Za-z0-9_-]{32})">', raw)
            check(label + "_document_context", status == 200 and match is not None)
            peer.context = match[1].decode()
            routed(label)
    a, b = peers["a"], peers["b"]
    check("distinct_local_instances", config["a"]["bootstrap_csrf"] != config["b"]["bootstrap_csrf"])
    forged = {"X-Auth-Request-User": config["a"]["sub"], "X-Auth-Request-Access-Token": "forged-not-a-token",
              "X-CE-Upstream": "127.0.0.1:1", "X-CE-Device-Proof": "forged", "X-CE-Route-Proof": "forged"}
    for path in ("/__ce_remote_health?nonce=" + "A" * 32, "/__ce_remote_health/child", "/internal/authorize"):
        status, _, returned = b.request(path, headers=forged)
        check("public_control_path_blocked_" + path.split("?")[0], status in (401, 403, 404)
              and not INTERNAL_HEADERS.intersection(key.lower() for key, _ in returned))
    routed("b", headers=forged)
    status, _, _ = b.request("/api/bootstrap", cookie="", headers={**forged, "X-CE-Context": b.context})
    check("anonymous_forged_identity_rejected", status in (401, 403))
    status, _, _ = b.request("/api/bootstrap")
    check("missing_context_rejected", status == 403)
    if a.context:
        status, _, _ = bootstrap("b", headers={**forged, "X-CE-Context": a.context})
        check("a_context_with_b_cookie_rejected", status == 403)
        status, _, _ = bootstrap("a")
        check("offline_a_api_no_fallback" if offline else "a_context_still_usable", status == (503 if offline else 200))
        if config.get("old_cookie_a"):
            old = SimpleCookie(config["old_cookie_a"])
            check("distinct_old_hub_cookie_supplied", "__Host-ce_remote" in old and "__Host-ce_remote" in a.cookies
                  and old["__Host-ce_remote"].value != a.cookies["__Host-ce_remote"].value)
            stale = "; ".join(f"{key}={old[key].value if key == '__Host-ce_remote' else item.value}"
                              for key, item in a.cookies.items())
            status, _, _ = bootstrap("a", cookie=stale)
            check("invalidated_a_cookie_rejected", status in (401, 403))
        else:
            report["checks"].append({"case": "invalidated_a_cookie_rejected", "status": "not_run"})
    else:
        report["checks"].append({"case": "a_context_and_old_cookie_checks", "status": "not_run"})
    if revoke:
        started = time.monotonic()
        status, raw, _ = a.request("/remote/api/devices/" + revoke + "/revoke", body={},
                                    headers={"X-CE-CSRF": sessions["a"]["csrf"]})
        check("temporary_a_revoke_accepted", status == 200 and json.loads(raw).get("state") in ("revoking", "revoked"))
        while session("a").get("device") is not None and time.monotonic() - started < 5:
            routed("b")
            time.sleep(0.1)
        elapsed = time.monotonic() - started
        report["directory_revocation_elapsed_seconds"] = round(elapsed, 3)
        check("directory_cleanup_within_5_seconds", elapsed <= 5 and session("a").get("device") is None)
        status, _, _ = bootstrap("a")
        check("revoked_a_new_admission_rejected", status == 503)
        routed("b")
    report["result"] = "http_checks_passed" if all(item["status"] == "pass" for item in report["checks"]) else "http_checks_passed_with_not_run"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-private", type=Path, default=os.environ.get("CE_REMOTE_ACCEPTANCE_INPUT"))
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--expect-a-offline", action="store_true")
    modes.add_argument("--revoke-temporary-a", metavar="DEVICE_ID")
    args = parser.parse_args(argv)
    report = {"scope": "HTTP directory and admission only; no existing SSH/WS teardown or browser RPC evidence", "checks": []}
    try:
        if not args.input_private:
            raise AcceptanceFailure("private_input_required")
        path = Path(args.input_private)
        if path.is_symlink() or (os.name != "nt" and path.stat().st_mode & 0o077):
            raise AcceptanceFailure("private_input_permissions")
        config = json.loads(path.read_text(encoding="utf-8"))
        origin = urlsplit(config["origin"])
        if origin.scheme != "https" or not origin.hostname or origin.username or origin.password or origin.path or origin.query or origin.fragment:
            raise AcceptanceFailure("https_origin_required")
        run(config, report, offline=args.expect_a_offline, revoke=args.revoke_temporary_a)
    except AcceptanceFailure as error:
        report.update(result="failed", failure=str(error))
    except Exception:
        report.update(result="failed", failure="transport_or_private_input_error")
    print(json.dumps(report, ensure_ascii=False))
    return 1 if report["result"] == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
