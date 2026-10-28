"""Fixed hub process assembly and explicit local administrator bootstrap."""

import json
import os
from pathlib import Path

from .identity import SSHSignatureVerifier, TokenIntrospector, VERIFICATION_MODES
from .health import DeviceChannelProbe
from .provisioner import UnixProvisionerClient
from .service import RemoteHubService
from .store import RemoteHubStore
from .directory import KeycloakUserDirectory


def build_service(config_path):
    path = Path(config_path)
    if path.is_symlink() or (os.name != "nt" and path.stat().st_mode & 0o077):
        raise ValueError("hub_config_requires_private_file")
    config = json.loads(path.read_text(encoding="utf-8"))
    credentials_keys = ("introspection_client_id", "introspection_client_secret")
    required = {"issuer", "database", "public_origin", "route_proof", "ssh_host", "ssh_host_key", "ssh_keygen",
                "provisioner_socket", "admin_subjects", "static_paths"}
    # The user directory and the introspection credentials are optional: without credentials access
    # tokens are verified locally against the issuer JWKS, without a directory the admin page lists
    # the hub's own members.
    optional = {"user_directory", "introspection_client_id", "introspection_client_secret", "token_verification"}
    if not required <= set(config) <= required | optional:
        raise ValueError("invalid_hub_config_fields")
    credentials = [config.get("introspection_client_id"), config.get("introspection_client_secret")]
    if (any(key in config for key in credentials_keys) and not all(
            isinstance(value, str) and value for value in credentials)) or not config["route_proof"]:
        raise ValueError("hub_secrets_required")
    verification = config.get("token_verification")
    if verification is not None and (verification not in VERIFICATION_MODES
                                    or (verification != "jwt" and not credentials[0])):
        raise ValueError("invalid_token_verification")
    admins = [(config["issuer"], sub) for sub in config["admin_subjects"]]
    directory = None
    if "user_directory" in config:
        values = config["user_directory"]
        if not isinstance(values, dict) or set(values) != {"client_id", "client_secret"}:
            raise ValueError("invalid_user_directory_config")
        directory = KeycloakUserDirectory(config["issuer"], **values)
    store = RemoteHubStore(config["database"])
    return RemoteHubService(store, TokenIntrospector(config["issuer"], credentials[0], credentials[1], mode=verification),
                            SSHSignatureVerifier(config["ssh_keygen"]),
                            UnixProvisionerClient(config["provisioner_socket"]), public_origin=config["public_origin"],
                            route_proof=config["route_proof"], ssh_host=config["ssh_host"], ssh_host_key=config["ssh_host_key"],
                            admin_subjects=admins, user_directory=directory, static_paths=config["static_paths"],
                            channel_probe=DeviceChannelProbe(config["public_origin"]))
