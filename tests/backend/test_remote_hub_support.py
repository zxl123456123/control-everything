"""Non-secret synthetic peers shared by the remote admission unit tests."""

import base64
import struct

from control_everything.integrations.remote_hub.identity import HubError, Identity
from control_everything.integrations.remote_hub.service import RemoteHubService
from control_everything.integrations.remote_hub.store import RemoteHubStore

KEY = "ssh-ed25519 " + base64.b64encode(struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32) + b"a" * 32).decode()
KEY_B = "ssh-ed25519 " + base64.b64encode(struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32) + b"b" * 32).decode()
INSTALL = "synthetic-installation-0001"
A = Identity("https://id.example.test/realms/test", "account-a", "workbench-desktop", 10000)
B = Identity(A.issuer, "account-b", A.azp, 10000)


class Verifier:
    def verify(self, payload, key, signature):
        if signature != "signature:" + base64.b64encode(payload).decode():
            raise HubError("invalid_signature", 403)


class Provisioner:
    def __init__(self):
        self.records, self.calls = {}, []
        self.fail_ensure = self.fail_cleanup = False

    def ensure_device(self, device_id, public_key, http_port, ws_port):
        self.calls.append(("ensure", device_id))
        if self.fail_ensure:
            raise OSError("synthetic ensure failure")
        self.records[device_id] = (public_key, http_port, ws_port)

    def disable_device(self, device_id):
        self.calls.append(("disable", device_id))

    def terminate_verified_connections(self, device_id):
        self.calls.append(("terminate", device_id))
        if self.fail_cleanup:
            raise OSError("synthetic cleanup failure")

    def inspect_device(self, device_id):
        self.calls.append(("inspect", device_id))
        return {"connections": 0, "listeners": 0}


def service(path, **options):
    store = RemoteHubStore(path, clock=lambda: 1000)
    store.set_member(A)
    store.set_member(B)
    return RemoteHubService(store, None, Verifier(), Provisioner(), public_origin="https://app.example.test",
                            route_proof="synthetic-internal-proof", ssh_host="ssh.example.test",
                            ssh_host_key=KEY, channel_probe=lambda device: True, **options)


def complete(hub, identity, challenge):
    return hub.complete_enrollment(identity, challenge["challenge_id"], "signature:" + challenge["payload"])


def bind(hub, identity=A, installation=INSTALL, key=KEY):
    return complete(hub, identity, hub.begin_enrollment(identity, installation, key, "Synthetic computer"))


def recovery(hub, result, identity=A, revision=None):
    return hub.begin_recovery(identity, INSTALL, KEY, result["device_id"], result["generation"],
                              revision if revision is not None else result["credential_revision"])
