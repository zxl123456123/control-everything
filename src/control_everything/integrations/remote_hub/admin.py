"""Fixed hub process assembly and explicit local administrator bootstrap."""

import json
import os
from pathlib import Path

from .identity import SSHSignatureVerifier, TokenIntrospector
from .health import DeviceChannelProbe
from .provisioner import UnixProvisionerClient
from .service import RemoteHubService
from .store import RemoteHubStore


def build_service(config_path):
    path = Path(config_path)
    if path.is_symlink() or (os.name != "nt" and path.stat().st_mode & 0o077):
        raise ValueError("hub_config_requires_private_file")
    config = json.loads(path.read_text(encoding="utf-8"))
    required = {"issuer", "introspection_client_id", "introspection_client_secret", "database",
                "public_origin", "route_proof", "ssh_host", "ssh_host_key", "ssh_keygen",
                "provisioner_socket", "admin_subjects", "static_paths"}
    if set(config) != required:
        raise ValueError("invalid_hub_config_fields")
    if not config["introspection_client_secret"] or not config["route_proof"]:
        raise ValueError("hub_secrets_required")
    admins = [(config["issuer"], sub) for sub in config["admin_subjects"]]
    store = RemoteHubStore(config["database"])
    return RemoteHubService(store, TokenIntrospector(config["issuer"], config["introspection_client_id"],
                            config["introspection_client_secret"]), SSHSignatureVerifier(config["ssh_keygen"]),
                            UnixProvisionerClient(config["provisioner_socket"]), public_origin=config["public_origin"],
                            route_proof=config["route_proof"], ssh_host=config["ssh_host"], ssh_host_key=config["ssh_host_key"],
                            admin_subjects=admins, static_paths=config["static_paths"],
                            channel_probe=DeviceChannelProbe(config["public_origin"]))
