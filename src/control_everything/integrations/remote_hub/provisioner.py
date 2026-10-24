"""Narrow Unix IPC for a dedicated device-only sshd instance."""

import json
import os
from pathlib import Path
import re
import socket
import struct

from .identity import HubError, public_key_fingerprint

OPERATIONS = {"ensure_device": {"device_id", "public_key", "http_port", "ws_port"},
              "disable_device": {"device_id"}, "terminate_verified_connections": {"device_id"},
              "inspect_device": {"device_id"}}


def validate_request(request, port_start=20000, port_end=20999):
    if not isinstance(request, dict) or request.get("operation") not in OPERATIONS:
        raise HubError("invalid_provisioner_request", 400)
    operation = request["operation"]
    if set(request) != OPERATIONS[operation] | {"operation"}:
        raise HubError("invalid_provisioner_request", 400)
    if not isinstance(request["device_id"], str) or not re.fullmatch(r"[0-9a-f]{24}", request["device_id"]):
        raise HubError("invalid_device_id", 400)
    if operation == "ensure_device":
        public_key_fingerprint(request["public_key"])
        ports = [request["http_port"], request["ws_port"]]
        if any(type(port) is not int or not port_start <= port <= port_end for port in ports) or ports[0] == ports[1]:
            raise HubError("invalid_device_ports", 400)
    return operation


def receive_message(connection):
    data = bytearray()
    while b"\n" not in data:
        chunk = connection.recv(4096)
        if not chunk:
            raise HubError("incomplete_provisioner_message", 400)
        data.extend(chunk)
        if len(data) > 16384:
            raise HubError("provisioner_message_too_large", 400)
    if data.count(b"\n") != 1 or not data.endswith(b"\n"):
        raise HubError("invalid_provisioner_message", 400)
    try:
        return json.loads(data)
    except (ValueError, UnicodeError):
        raise HubError("invalid_provisioner_message", 400) from None


class UnixProvisionerClient:
    def __init__(self, socket_path):
        self.socket_path = str(socket_path)

    def _call(self, operation, **values):
        request = dict(operation=operation, **values)
        validate_request(request)
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(8)
            connection.connect(self.socket_path)
            connection.sendall(json.dumps(request).encode() + b"\n")
            result = receive_message(connection)
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise HubError("provisioner_failed", 503)
        return result["result"]

    def ensure_device(self, device_id, public_key, http_port, ws_port):
        return self._call("ensure_device", device_id=device_id, public_key=public_key,
                          http_port=http_port, ws_port=ws_port)

    def disable_device(self, device_id):
        return self._call("disable_device", device_id=device_id)

    def terminate_verified_connections(self, device_id):
        return self._call("terminate_verified_connections", device_id=device_id)

    def inspect_device(self, device_id):
        return self._call("inspect_device", device_id=device_id)


def serve_connection(connection, backend, allowed_uid):
    """An inherited, root-owned systemd socket controls group access; uid is checked again."""
    connection.settimeout(8)
    _, uid, _ = struct.unpack("3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    if uid != allowed_uid:
        raise HubError("provisioner_peer_rejected", 403)
    try:
        request = receive_message(connection)
        operation = validate_request(request, backend.port_start, backend.port_end)
        result = getattr(backend, operation)(**{key: value for key, value in request.items() if key != "operation"})
        response = {"ok": True, "result": result}
    except Exception:
        response = {"ok": False, "error": "provisioner_failed"}
    connection.sendall(json.dumps(response).encode() + b"\n")


def atomic_private_file(path, contents, mode=0o600):
    path = Path(path)
    if path.is_symlink() or path.parent.is_symlink():
        raise HubError("unsafe_provisioner_path", 503)
    temporary = path.with_name(path.name + ".new")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(temporary, flags, mode)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, mode)
    finally:
        if temporary.exists():
            temporary.unlink()
