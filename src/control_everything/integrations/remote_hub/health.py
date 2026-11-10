"""Two bounded, directory-selected HTTP probes; a TCP connection is not readiness."""

import http.client
import json
import secrets
import socket
import threading
import time
from urllib.parse import urlsplit


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_health_field")
        result[key] = value
    return result


class DeviceChannelProbe:
    def __init__(self, public_origin, *, connection_factory=http.client.HTTPConnection):
        self.public_origin = public_origin
        self.public_host = urlsplit(public_origin).netloc
        self.connection_factory = connection_factory

    def __call__(self, device):
        for channel, port in (("http", device["http_port"]), ("ws", device["ws_port"])):
            if not self._probe(device, channel, port):
                return False
        return True

    def _probe(self, device, channel, port):
        if type(port) is not int or not 1024 <= port <= 65535:
            return False
        nonce = secrets.token_urlsafe(24)
        connection = self.connection_factory("127.0.0.1", port, timeout=2)
        deadline = time.monotonic() + 2
        transport = []
        def abort():
            current = transport[0] if transport else connection.sock
            if current is not None:
                try:
                    current.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            connection.close()
        timer = threading.Timer(2, abort)
        timer.daemon = True
        timer.start()
        try:
            connection.request("GET", "/__ce_remote_health?nonce=" + nonce, headers={
                "Host": self.public_host, "Origin": self.public_origin,
                "X-CE-Device-Proof": device["proxy_secret"], "Accept": "application/json"})
            if connection.sock is not None:
                transport.append(connection.sock)
            response = connection.getresponse()
            if (response.status != 200 or response.getheader("Content-Type", "").split(";")[0].strip().lower() != "application/json"
                    or response.getheader("Content-Encoding", "identity") != "identity"):
                return False
            raw = response.read(4097)
            if len(raw) > 4096 or time.monotonic() >= deadline:
                return False
            result = json.loads(raw, object_pairs_hook=_unique_object)
            expected = {"nonce": nonce, "device_id": device["device_id"], "generation": device["generation"],
                        "platform_installation_id": device["installation_id"], "channel": channel, "ready": True}
            return (type(result) is dict and result == expected and type(result.get("generation")) is int
                    and result.get("ready") is True)
        except (OSError, ValueError, http.client.HTTPException):
            return False
        finally:
            timer.cancel()
            connection.close()
