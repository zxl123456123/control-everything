"""Explicit per-device HTTPS access policy; never infer trust from request headers."""

import base64
from dataclasses import dataclass, field
import ipaddress
import re
import secrets
from urllib.parse import urlsplit

RUNTIME_PATH = "/workbench-runtime"
PROXY_HEADER = "X-CE-Device-Proof"


def public_origin(value):
    if not isinstance(value, str) or not value.isascii() or any(char.isspace() for char in value):
        raise ValueError("remote_origin_invalid")
    try:
        parsed = urlsplit(value)
        host, port = parsed.hostname, parsed.port
        if not host or "%" in host or parsed.scheme != "https" or parsed.username is not None or parsed.password is not None:
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
            authority = f"[{address.compressed}]" if address.version == 6 else str(address)
        except ValueError:
            # Browsers normalize legacy numeric IPv4 spellings; do not accept them as DNS.
            if re.fullmatch(r"(?:[0-9]+|0x[0-9a-f]+)", host.rsplit(".", 1)[-1]):
                raise ValueError()
            if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host) or any(
                not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in host.split(".")
            ):
                raise ValueError()
            authority = host
        if port is not None:
            if port == 443 or port == 0:
                raise ValueError()
            authority += f":{port}"
        if value != f"https://{authority}":
            raise ValueError()
    except ValueError:
        raise ValueError("remote_origin_invalid") from None
    return value


@dataclass(frozen=True)
class RemoteAccess:
    public_origin: str
    proxy_secret: str = field(repr=False)

    def __post_init__(self):
        public_origin(self.public_origin)
        secret = self.proxy_secret
        if not isinstance(secret, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43,172}", secret):
            raise ValueError("remote_proxy_secret_invalid")
        try:
            decoded = base64.urlsafe_b64decode(secret + "=" * (-len(secret) % 4))
        except ValueError:
            raise ValueError("remote_proxy_secret_invalid") from None
        if len(decoded) < 32 or base64.urlsafe_b64encode(decoded).decode().rstrip("=") != secret:
            raise ValueError("remote_proxy_secret_invalid")

    @property
    def authority(self):
        return self.public_origin.removeprefix("https://")

    @property
    def websocket_origin(self):
        return "wss://" + self.authority

    @property
    def websocket_endpoint(self):
        return self.websocket_origin + RUNTIME_PATH

    def accept_proxy_request(self, headers):
        tokens = headers.get_all(PROXY_HEADER, [])
        origins = headers.get_all("Origin", [])
        return (headers.get_all("Host", []) == [self.authority]
                and len(tokens) == 1 and tokens[0].isascii()
                and secrets.compare_digest(tokens[0], self.proxy_secret)
                and (not origins or origins == [self.public_origin]))
