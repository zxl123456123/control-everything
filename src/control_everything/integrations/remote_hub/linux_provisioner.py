"""Root-only, fixed-path SSH identity provisioning, separate from hub HTTP handling."""

import json
import os
from pathlib import Path
import subprocess

if os.name == "posix":
    import pwd
else:
    pwd = None

from .identity import HubError
from .linux_processes import LinuxProcessInspector
from .provisioner import atomic_private_file, validate_request


class LinuxDeviceProvisioner:
    def __init__(self, state_root="/var/lib/ce-device-ssh", *, port_start=20000, port_end=20999,
                 processes=None, runner=subprocess.run):
        self.root = Path(state_root)
        self.port_start, self.port_end = port_start, port_end
        self.processes, self.runner = processes or LinuxProcessInspector(), runner
        if getattr(os, "geteuid", lambda: -1)() != 0:
            raise HubError("provisioner_requires_root", 503)
        # sshd reads the public authorized-key file under the target uid.
        # Private registry files remain 0600; parent traversal must be allowed.
        self.root.mkdir(mode=0o755, parents=True, exist_ok=True)
        if self.root.is_symlink() or self.root.stat().st_uid != 0 or self.root.stat().st_mode & 0o022:
            raise HubError("unsafe_provisioner_root", 503)
        os.chmod(self.root, 0o755)
        (self.root / "keys").mkdir(mode=0o755, exist_ok=True)
        if (self.root / "keys").is_symlink():
            raise HubError("unsafe_provisioner_path", 503)
        os.chmod(self.root / "keys", 0o755)

    def _run(self, arguments):
        result = self.runner(arguments, capture_output=True, timeout=10, check=False)
        if result.returncode:
            raise HubError("device_account_operation_failed", 503)

    def _record(self, device_id):
        validate_request({"operation": "inspect_device", "device_id": device_id}, self.port_start, self.port_end)
        path = self.root / (device_id + ".json")
        if not path.exists():
            raise HubError("device_identity_unknown", 404)
        if path.is_symlink():
            raise HubError("unsafe_provisioner_path", 503)
        record = json.loads(path.read_text(encoding="utf-8"))
        user = pwd.getpwnam("ced_" + device_id)
        if user.pw_uid != record["uid"] or user.pw_shell != "/usr/sbin/nologin":
            raise HubError("device_account_changed", 503)
        return record

    def ensure_device(self, device_id, public_key, http_port, ws_port):
        validate_request(dict(operation="ensure_device", device_id=device_id, public_key=public_key,
                              http_port=http_port, ws_port=ws_port), self.port_start, self.port_end)
        path, username = self.root / (device_id + ".json"), "ced_" + device_id
        request = {"device_id": device_id, "public_key": public_key, "http_port": http_port, "ws_port": ws_port}
        if path.exists():
            record = self._record(device_id)
            if record.get("disabled") or any(record[key] != value for key, value in request.items()):
                raise HubError("device_identity_conflict", 409)
        else:
            for other in self.root.glob("*.json"):
                record = json.loads(other.read_text(encoding="utf-8"))
                if {record["http_port"], record["ws_port"]} & {http_port, ws_port}:
                    if (not record.get("disabled") or self.processes.inspect(record["uid"],
                            {record["http_port"], record["ws_port"]}) != {"connections": 0, "listeners": 0}):
                        raise HubError("device_port_conflict", 409)
            try:
                pwd.getpwnam(username)
            except KeyError:
                pass
            else:
                raise HubError("existing_unowned_account", 409)
            # A non-password '*' value avoids an OpenSSH locked-account '!'; no shell sessions are allowed.
            self._run(["/usr/sbin/useradd", "--system", "--no-create-home", "--home-dir", "/nonexistent",
                       "--shell", "/usr/sbin/nologin", "--password", "*", "--", username])
            record = dict(request, uid=pwd.getpwnam(username).pw_uid, disabled=False)
            atomic_private_file(path, json.dumps(record))
        key = (f'restrict,port-forwarding,permitlisten="127.0.0.1:{http_port}",'
               f'permitlisten="127.0.0.1:{ws_port}" {public_key}\n')
        atomic_private_file(self.root / "keys" / username, key, 0o644)
        return {"provisioned": True}

    def disable_device(self, device_id):
        record = self._record(device_id)
        atomic_private_file(self.root / "keys" / ("ced_" + device_id), "", 0o644)
        record["disabled"] = True
        atomic_private_file(self.root / (device_id + ".json"), json.dumps(record))
        return {"disabled": True}

    def terminate_verified_connections(self, device_id):
        record = self._record(device_id)
        if not record["disabled"]:
            raise HubError("disable_before_termination", 409)
        return self.processes.terminate(record["uid"], {record["http_port"], record["ws_port"]})

    def inspect_device(self, device_id):
        record = self._record(device_id)
        return self.processes.inspect(record["uid"], {record["http_port"], record["ws_port"]})
