"""Self-hosted device authorization and installation-owned remote connection lifecycle."""

import base64
from contextlib import contextmanager
import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
import uuid

from control_everything.integrations.remote_access import RemoteAccess, public_origin
from control_everything.integrations.remote_tunnel import RemoteTunnel, TunnelConfig
from control_everything.integrations.workbench_runtime import safe_path
from control_everything.platform.windows_jobs import WindowsAPI, ProcessError

NAMESPACE = "control-everything-device-enrollment-v1"
LIMIT = 65536


class ConnectorError(Exception):
    def __init__(self, code, status=0):
        self.code, self.status = code, status
        super().__init__(code)


@dataclass(frozen=True)
class ConnectorConfig:
    issuer: str
    hub_origin: str
    ssh_executable: Path
    keygen_executable: Path
    client_id: str = "workbench-desktop"

    def __post_init__(self):
        public_origin(self.hub_origin)
        parsed = urlsplit(self.issuer)
        public_origin("https://" + parsed.netloc)
        if (parsed.scheme != "https" or parsed.query or parsed.fragment or
                not re.fullmatch(r"/(?:identity/)?realms/[A-Za-z0-9_.-]+", parsed.path) or
                parsed.path.rsplit("/", 1)[-1] in (".", "..")):
            raise ValueError("remote_issuer_invalid")
        if self.client_id != "workbench-desktop":
            raise ValueError("remote_client_invalid")
        for path in (self.ssh_executable, self.keygen_executable):
            if not safe_path(path).is_file():
                raise ValueError("remote_tool_missing")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ConnectorError("remote_redirect_rejected")


class RemotePeer:
    """Fixed HTTPS endpoints; never follow identity or hub redirects."""
    def __init__(self, config):
        self.config = config
        self.opener = build_opener(NoRedirect())

    def request(self, method, path, body=None, token=None, *, oauth=False):
        if oauth:
            if path not in {"/auth/device", "/token"}:
                raise ConnectorError("remote_endpoint_invalid")
            url = self.config.issuer + "/protocol/openid-connect" + path
        else:
            if not path.startswith("/remote/desktop/") or "?" in path or "#" in path:
                raise ConnectorError("remote_endpoint_invalid")
            url = self.config.hub_origin + path
        headers = {"Accept": "application/json"}
        data = None
        if body is not None:
            data = (urlencode(body) if oauth else json.dumps(body, allow_nan=False)).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded" if oauth else "application/json"
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                raw = response.read(LIMIT + 1)
        except HTTPError as error:
            raw = error.read(LIMIT + 1)
            try:
                code = json.loads(raw).get("error", "remote_request_rejected")
            except (ValueError, AttributeError):
                code = "remote_request_rejected"
            if not isinstance(code, str) or not re.fullmatch(r"[a-z_]{1,80}", code):
                code = "remote_request_rejected"
            raise ConnectorError(code, error.code) from None
        except (URLError, TimeoutError, OSError):
            raise ConnectorError("remote_network_unavailable") from None
        if len(raw) > LIMIT:
            raise ConnectorError("remote_response_invalid")
        try:
            value = json.loads(raw)
        except ValueError:
            raise ConnectorError("remote_response_invalid") from None
        if not isinstance(value, dict):
            raise ConnectorError("remote_response_invalid")
        return value


class DPAPI:
    """CurrentUser only, with UI forbidden; no machine-wide or plaintext fallback."""
    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]

    def _call(self, raw, decrypt):
        if os.name != "nt":
            raise ConnectorError("remote_windows_required")
        source_buffer = (ctypes.c_ubyte * len(raw)).from_buffer_copy(raw)
        source, result = self.Blob(len(raw), source_buffer), self.Blob()
        crypt = ctypes.WinDLL("crypt32", use_last_error=True)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree.restype = ctypes.c_void_p
        operation = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
        operation.argtypes = [ctypes.POINTER(self.Blob), ctypes.c_void_p, ctypes.c_void_p,
                              ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(self.Blob)]
        operation.restype = wintypes.BOOL
        if not operation(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
            raise ConnectorError("remote_credential_protection_failed")
        try:
            return ctypes.string_at(result.data, result.size)
        finally:
            kernel.LocalFree(result.data)

    def protect(self, raw):
        return self._call(raw, False)

    def unprotect(self, raw):
        return self._call(raw, True)


def restrict_private(path):
    """Remove inherited grants before writing private material."""
    if os.name != "nt":
        raise ConnectorError("remote_windows_required")
    system = Path(os.environ["SystemRoot"]) / "System32"
    result = subprocess.run([str(system / "whoami.exe"), "/user", "/fo", "csv", "/nh"],
                            capture_output=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    sid = re.search(rb"S-1-5-[0-9-]+", result.stdout)
    if not sid:
        raise ConnectorError("remote_user_identity_missing")
    descriptor = ctypes.c_void_p()
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype = wintypes.BOOL
    advapi.SetFileSecurityW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    advapi.SetFileSecurityW.restype = wintypes.BOOL
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    sddl = "D:P(A;OICI;FA;;;" + sid.group().decode() + ")(A;OICI;FA;;;SY)"
    if not advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, ctypes.byref(descriptor), None):
        raise ConnectorError("remote_private_acl_failed")
    try:
        if not advapi.SetFileSecurityW(str(path), 0x80000004, descriptor):
            raise ConnectorError("remote_private_acl_failed")
    finally:
        kernel.LocalFree(descriptor)


class ConnectorStore:
    def __init__(self, root, *, protector=None, secure_directory=restrict_private, api=None):
        self.root = safe_path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        secure_directory(self.root)
        self.protector = protector or DPAPI()
        self.api = api
        self._thread_lock = threading.Lock()

    @contextmanager
    def locked(self):
        with self._thread_lock:
            api = self.api or WindowsAPI()
            owner = api.owner(self.root / "connector.lock")
            if not owner:
                raise ConnectorError("remote_installation_in_use")
            try:
                yield
            finally:
                api.close(owner)

    def read(self, name, *, protected=False):
        path = safe_path(self.root / name)
        if not path.exists():
            return None
        if path.stat().st_size > LIMIT:
            raise ConnectorError("remote_state_invalid")
        raw = path.read_bytes()
        try:
            value = json.loads(self.protector.unprotect(raw) if protected else raw)
        except (ValueError, OSError):
            raise ConnectorError("remote_state_invalid") from None
        if not isinstance(value, dict):
            raise ConnectorError("remote_state_invalid")
        return value

    def write(self, name, value, *, protected=False):
        raw = json.dumps(value, allow_nan=False).encode()
        if protected:
            raw = self.protector.protect(raw)
        path = safe_path(self.root / name)
        temporary = safe_path(self.root / (".pending-" + uuid.uuid4().hex))
        try:
            with temporary.open("xb") as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def clear(self, name):
        safe_path(self.root / name).unlink(missing_ok=True)


class DeviceKeys:
    def __init__(self, executable):
        self.executable = safe_path(executable)

    def ensure(self, store):
        key = safe_path(store.root / "device_ed25519")
        identity = store.read("installation.json")
        if identity:
            if not key.is_file():
                raise ConnectorError("remote_private_key_missing")
        else:
            if key.exists():
                raise ConnectorError("remote_identity_incomplete")
            self._run(["-q", "-t", "ed25519", "-N", "", "-C", "control-everything-device", "-f", str(key)])
            identity = {"installation_id": str(uuid.uuid4())}
            store.write("installation.json", identity)
        public = " ".join(self._run(["-y", "-f", str(key)]).decode().split()[:2])
        if not re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]{68}", public):
            raise ConnectorError("remote_public_key_invalid")
        fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(base64.b64decode(public.split()[1])).digest()).decode().rstrip("=")
        return {**identity, "public_key": public, "key_fingerprint": fingerprint}

    def sign(self, store, payload):
        return self._run(["-Y", "sign", "-f", str(store.root / "device_ed25519"), "-n", NAMESPACE], payload).decode()

    def _run(self, argv, data=None):
        try:
            result = subprocess.run([str(self.executable), *argv], input=data, capture_output=True,
                                    timeout=20, check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            return result.stdout
        except (OSError, subprocess.SubprocessError):
            raise ConnectorError("remote_key_operation_failed") from None


class RemoteConnector:
    def __init__(self, config, store, *, peer=None, keys=None, tunnel_factory=RemoteTunnel,
                 now=time.monotonic, on_revoked=None):
        self.config, self.store = config, store
        self.peer = peer or RemotePeer(config)
        self.keys = keys or DeviceKeys(config.keygen_executable)
        self.tunnel_factory, self.now = tunnel_factory, now
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._worker = None
        self._oauth = None
        self._grant = None
        self._identity = None
        self._account = None
        self._status_match = None
        self._tunnel = None
        self._access = None
        self._state = "unbound"
        self._code = "unbound"
        self._credentials = None
        self._next_retry, self._failures = 0, 0
        self._operation = None
        self._on_revoked = on_revoked
        self._health_identity = None

    def status(self):
        with self._lock:
            result = {"state": self._state, "code": self._code, "configured": True,
                      "portal_url": self.config.hub_origin + "/remote"}
            if self._grant and self._state == "authorizing":
                result.update({k: self._grant[k] for k in ("user_code", "verification_uri", "expires_in")})
            if self._account and self._state == "awaiting_local_confirmation":
                result.update(account=dict(self._account), operation=self._operation, member_active=True)
            elif self._account and self._code == "remote_membership_required":
                result.update(account=dict(self._account), member_active=False)
            return result

    @property
    def remote_access(self):
        return self._access

    def begin_authorization(self):
        with self._lock:
            if self._worker and self._worker.is_alive():
                raise ConnectorError("remote_authorization_in_progress")
            self._oauth = self._account = self._status_match = None
            self._stop.clear()
            self._state, self._code = "authorizing", "authorization_pending"
            self._worker = threading.Thread(target=self._authorize, name="remote-device-authorization", daemon=True)
            self._worker.start()
        return self.status()

    def _authorize(self):
        try:
            with self.store.locked():
                self._identity = self.keys.ensure(self.store)
            grant = self.peer.request("POST", "/auth/device", {"client_id": self.config.client_id, "scope": "openid profile"}, oauth=True)
            required = ("device_code", "user_code", "verification_uri", "expires_in")
            if any(k not in grant for k in required) or type(grant["expires_in"]) is not int or not 1 <= grant["expires_in"] <= 1800:
                raise ConnectorError("remote_grant_invalid")
            uri = urlsplit(grant["verification_uri"])
            issuer = urlsplit(self.config.issuer)
            if (uri.scheme, uri.netloc) != (issuer.scheme, issuer.netloc) or uri.username or uri.password or uri.fragment:
                raise ConnectorError("remote_verification_uri_invalid")
            interval = grant.get("interval", 5)
            if type(interval) is not int or not 1 <= interval <= 60:
                raise ConnectorError("remote_grant_invalid")
            with self._lock:
                self._grant = grant
            deadline = self.now() + grant["expires_in"]
            while not self._stop.wait(interval):
                if self.now() >= deadline:
                    raise ConnectorError("expired_token")
                try:
                    token = self.peer.request("POST", "/token", {"client_id": self.config.client_id,
                        "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": grant["device_code"]}, oauth=True)
                except ConnectorError as error:
                    if error.code == "authorization_pending":
                        continue
                    if error.code == "slow_down":
                        interval += 5
                        continue
                    raise
                access = token.get("access_token")
                if not isinstance(access, str) or not access or len(access) > 32768:
                    raise ConnectorError("remote_token_invalid")
                identity = self.peer.request("GET", "/remote/desktop/identity", token=access)
                account = identity.get("account", {})
                if (not isinstance(account.get("sub"), str) or not account["sub"]
                        or account.get("issuer") != self.config.issuer):
                    raise ConnectorError("remote_identity_invalid")
                self._account = {"issuer": account["issuer"], "sub": account["sub"], "name": str(account.get("name") or account["sub"])}
                if identity.get("member_active") is not True:
                    raise ConnectorError("remote_membership_required")
                try:
                    match = self.peer.request("POST", "/remote/desktop/enrollment/status", self._identity_body(), access)
                except ConnectorError as error:
                    if error.status != 404:
                        raise
                    match = None
                pending = self.store.read("pending.json")
                if pending and not match:
                    raise ConnectorError("remote_recovery_not_found")
                if match and not match.get("recoverable"):
                    raise ConnectorError("device_not_recoverable")
                with self._lock:
                    if self._stop.is_set():
                        return
                    self._oauth = access
                    self._account = {"issuer": account["issuer"], "sub": account["sub"], "name": str(account.get("name") or account["sub"])}
                    self._status_match = match
                    self._operation = "recover" if match else "bind"
                    self._state, self._code = "awaiting_local_confirmation", "local_confirmation_required"
                return
        except (ConnectorError, ProcessError, OSError, ValueError) as error:
            with self._lock:
                self._oauth = None
                self._state, self._code = "unbound", getattr(error, "code", "remote_state_invalid")
        finally:
            self._grant = None

    def _identity_body(self):
        return {k: self._identity[k] for k in ("installation_id", "public_key")}

    def confirm(self):
        with self._lock:
            if self._state != "awaiting_local_confirmation" or not self._oauth:
                raise ConnectorError("remote_confirmation_required")
            self._state = "enrolling"
            try:
                with self.store.locked():
                    body = self._identity_body()
                    match = self._status_match
                    if self._operation == "recover":
                        body.update(device_id=match["device_id"], generation=match["generation"],
                                    expected_credential_revision=match["credential_revision"])
                        path = "/remote/desktop/enrollment/recover"
                    else:
                        body["name"] = "Windows computer"
                        path = "/remote/desktop/enrollment"
                    challenge = self.peer.request("POST", path, body, self._oauth)
                    challenge_id = challenge.get("challenge_id", "")
                    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", challenge_id):
                        raise ConnectorError("remote_challenge_invalid")
                    payload = base64.b64decode(challenge["payload"], validate=True)
                    expected = {"challenge_id": challenge_id, "operation": self._operation,
                                "installation_id": self._identity["installation_id"], "key_fingerprint": self._identity["key_fingerprint"]}
                    if match:
                        expected.update(target_device_id=match["device_id"], generation=match["generation"],
                                        expected_credential_revision=match["credential_revision"])
                    self.store.write("pending.json", expected)
                    signature = self.keys.sign(self.store, payload)
                    reply = self.peer.request("POST", f"/remote/desktop/enrollment/{challenge_id}/complete", {"signature": signature}, self._oauth)
                    self._accept_reply(expected, reply)
                self._state, self._code = "connecting", "connecting"
                return self.status()
            except (ConnectorError, ProcessError, OSError, ValueError, KeyError) as error:
                self._state, self._code = "unbound", getattr(error, "code", "remote_state_invalid")
                self._credentials = None
                raise ConnectorError(self._code) from None
            finally:
                self._oauth = self._account = None

    def _accept_reply(self, pending, reply):
        if self.store.read("pending.json") != pending:
            raise ConnectorError("remote_stale_response")
        revision = 1 if pending["operation"] == "bind" else pending["expected_credential_revision"] + 1
        if (type(reply.get("credential_revision")) is not int or reply["credential_revision"] != revision
                or not isinstance(reply.get("device_id"), str) or not reply["device_id"]
                or type(reply.get("generation")) is not int or reply["generation"] < 1
                or (pending["operation"] == "recover" and
                    (reply["device_id"] != pending["target_device_id"] or reply["generation"] != pending["generation"]))):
            raise ConnectorError("remote_revision_mismatch")
        previous = self.store.read("credentials.bin", protected=True)
        if previous and previous["credential_revision"] >= revision:
            raise ConnectorError("remote_stale_response")
        token = reply.get("control_token")
        if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43,172}", token):
            raise ConnectorError("remote_control_token_invalid")
        credential = {k: reply[k] for k in ("device_id", "generation", "credential_revision", "control_token")}
        # Persist before config: loss of either response is recovered by fresh OAuth + CAS.
        self.store.write("credentials.bin", credential, protected=True)
        config = self.peer.request("GET", "/remote/desktop/config", token=token)
        self._check_config(credential, config)
        self._credentials = credential
        self._set_access(credential, config)
        self.store.clear("pending.json")

    def _check_config(self, credential, config):
        if (type(config.get("generation")) is not int or type(config.get("credential_revision")) is not int
                or any(config.get(k) != credential[k] for k in ("device_id", "generation", "credential_revision"))):
            raise ConnectorError("remote_revision_mismatch")
        RemoteAccess(config["public_origin"], config["proxy_token"])
        return config

    def prepare_access(self):
        """Load a confirmed private credential before starting the single runtime."""
        with self._lock, self.store.locked():
            if self.store.read("revocation.json") or self.store.read("revocation_requested.json"):
                return None
            if self.store.read("pending.json"):
                raise ConnectorError("remote_recovery_required")
            credential = self.store.read("credentials.bin", protected=True)
            if not credential:
                return None
            config = self._check_config(credential, self.peer.request("GET", "/remote/desktop/config", token=credential["control_token"]))
            self._credentials = credential
            self._set_access(credential, config)
            return self._access

    @property
    def health_identity(self):
        # Probe handlers must not wait on a heartbeat holding the connector lock.
        snapshot = self._health_identity
        return dict(snapshot) if snapshot else None

    def _set_access(self, credential, config):
        installation = self.store.read("installation.json")
        self._access = RemoteAccess(config["public_origin"], config["proxy_token"])
        self._health_identity = {"device_id": credential["device_id"], "generation": credential["generation"],
                                 "platform_installation_id": installation["installation_id"]}

    def _retire_remote_grants(self):
        self.store.write("revocation.json", {"remote_grant_cleanup_pending": True})
        if self._on_revoked is None:
            raise ConnectorError("remote_grant_cleanup_unverified")
        try:
            self._on_revoked()
        except Exception:
            raise ConnectorError("remote_grant_cleanup_unverified") from None
        self.store.clear("revocation.json")

    def resume_revocation_cleanup(self):
        """Product calls after runtime startup; a failed retirement survives EXE exit."""
        with self._lock, self.store.locked():
            requested = self.store.read("revocation_requested.json") is not None
            if requested or self.store.read("revocation.json"):
                self._state = "offline" if requested else "revoked"
                self._code = "remote_revoke_unconfirmed" if requested else "remote_grant_cleanup_unverified"
                self._retire_remote_grants()
                self._code = "remote_revoke_unconfirmed" if requested else "revoked"
            return self.status()

    def connect(self, http_port, ws_port, *, runtime_ready=True):
        """Called by the product worker; no HTTP GET starts a tunnel or OAuth polling."""
        with self._lock:
            # The authorization/confirmation path owns these stages until it yields.
            if self._state in {"authorizing", "awaiting_local_confirmation", "enrolling"}:
                return self.status()
            if self.store.read("revocation_requested.json"):
                self._state, self._code = "offline", "remote_revoke_unconfirmed"
                return self.status()
            if self.store.read("revocation.json"):
                self._state, self._code = "revoked", "remote_grant_cleanup_unverified"
            if self._state == "revoked" or self.now() < self._next_retry:
                return self.status()
            try:
                with self.store.locked():
                    if self.store.read("pending.json"):
                        raise ConnectorError("remote_recovery_required")
                    credential = self.store.read("credentials.bin", protected=True)
                    if not credential:
                        return self.status()
                    config = self._check_config(credential, self.peer.request("GET", "/remote/desktop/config", token=credential["control_token"]))
                    if not runtime_ready:
                        raise ConnectorError("remote_runtime_unavailable")
                    access = RemoteAccess(config["public_origin"], config["proxy_token"])
                    if self._tunnel and not self._tunnel.running:
                        self._tunnel.close()
                        self._tunnel = None
                    if not self._tunnel:
                        tunnel_config = self._tunnel_config(config)
                        self._tunnel = self.tunnel_factory(tunnel_config)
                        self._tunnel.start(http_port, ws_port)
                    self._set_access(credential, config)
                    response = self.peer.request("POST", "/remote/desktop/heartbeat", {
                        "installation_id": self.store.read("installation.json")["installation_id"],
                        "runtime_ready": True}, credential["control_token"])
                    self._access, self._credentials = access, credential
                    self._state = response.get("state") if response.get("state") in {"online", "offline"} else "connecting"
                    self._code = self._state
                    self._failures = 0
            except (ConnectorError, ProcessError, OSError, ValueError, KeyError) as error:
                self._disconnect()
                code = getattr(error, "code", "remote_connection_failed")
                if getattr(error, "status", 0) in {401, 403, 410}:
                    self._state = "revoked"
                    self._code = "remote_authorization_required"
                    try:
                        self._retire_remote_grants()
                    except ConnectorError as cleanup:
                        self._code = cleanup.code
                else:
                    self._state, self._code = "offline", code
                    self._failures += 1
                    self._next_retry = self.now() + min(60, 2 ** min(self._failures, 6))
            return self.status()

    def _tunnel_config(self, config):
        host, user, port = config["ssh"]["host"], config["ssh"]["user"], config["ssh"]["port"]
        if (not isinstance(host, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,252}", host)
                or not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", user)
                or type(port) is not int or not 1 <= port <= 65535):
            raise ConnectorError("remote_ssh_configuration_invalid")
        hostkey = config["ssh"]["host_key"]
        if not isinstance(hostkey, str) or not re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]{68}", hostkey):
            raise ConnectorError("remote_host_key_invalid")
        known = self.store.root / "known_hosts"
        known.write_text(f"[{host}]:{port} {hostkey}\n", encoding="utf-8")
        path = self.store.root / "ssh_config"
        key = self.store.root / "device_ed25519"
        def quote(value):
            value = str(value).replace("\\", "/")
            if any(c in value for c in '\r\n\0"'):
                raise ConnectorError("remote_ssh_path_invalid")
            return '"' + value + '"'
        path.write_text(f"Host ce-device\n HostName {host}\n User {user}\n Port {port}\n"
            f" IdentityFile {quote(key)}\n IdentitiesOnly yes\n UserKnownHostsFile {quote(known)}\n"
            " GlobalKnownHostsFile none\n PasswordAuthentication no\n KbdInteractiveAuthentication no\n", encoding="utf-8")
        return TunnelConfig(self.config.ssh_executable, path, "ce-device", config["remote_http_port"], config["remote_ws_port"])

    def revoke(self):
        with self._lock, self.store.locked():
            credential = self.store.read("credentials.bin", protected=True)
            if not credential:
                raise ConnectorError("remote_authorization_required")
            self.store.write("revocation_requested.json", {"server_revoke_unconfirmed": True})
            # Preserve local cleanup before a response can permit either old file's removal.
            self.store.write("revocation.json", {"remote_grant_cleanup_pending": True})
            self._disconnect()
            try:
                if credential:
                    self.peer.request("POST", "/remote/desktop/revoke", {}, credential["control_token"])
            except ConnectorError:
                self._state, self._code = "offline", "remote_revoke_unconfirmed"
                try:
                    self._retire_remote_grants()
                except ConnectorError:
                    pass
                raise ConnectorError("remote_revoke_unconfirmed") from None
            self.store.clear("revocation_requested.json")
            self._state, self._code = "revoked", "revoked"
            self._credentials = None
            self.store.clear("credentials.bin")
            try:
                self._retire_remote_grants()
            except ConnectorError as cleanup:
                self._code = cleanup.code
                raise

    def _disconnect(self):
        self._access = None
        self._health_identity = None
        tunnel, self._tunnel = self._tunnel, None
        if tunnel:
            try:
                tunnel.close()
            except (ProcessError, OSError, RuntimeError):
                self._state, self._code = "offline", "remote_tunnel_cleanup_unverified"
                raise ConnectorError(self._code) from None

    def close(self):
        self._stop.set()
        if self._worker:
            self._worker.join(timeout=16)
            if self._worker.is_alive():
                raise ConnectorError("remote_worker_cleanup_unverified")
        with self._lock:
            self._oauth = self._account = self._grant = None
            self._disconnect()
