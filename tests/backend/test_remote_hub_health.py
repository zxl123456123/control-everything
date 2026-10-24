"""Bounded fake HTTP health peers; never use a real remote computer."""

import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

from control_everything.integrations.remote_hub.health import DeviceChannelProbe
from .test_remote_hub_support import INSTALL, bind, service


class Response:
    status = 200
    content_type = "application/json"

    def __init__(self, data):
        self.data = data

    def getheader(self, name, default=None):
        return self.content_type if name == "Content-Type" else default

    def read(self, length):
        return self.data[:length]


class HealthTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / "hub.db")
        result = bind(self.hub)
        self.device = self.hub.store.device(result["device_id"])
        self.calls, self.change = [], lambda data, response: None

    def factory(self, host, port, timeout):
        case = self
        class Connection:
            sock = None
            def request(self, method, path, headers):
                case.calls.append((host, port, timeout, method, path, headers))
                self.nonce = path.split("nonce=")[1]
            def getresponse(self):
                data = {"nonce": self.nonce, "device_id": case.device["device_id"], "generation": case.device["generation"],
                        "platform_installation_id": INSTALL, "channel": "http" if port == case.device["http_port"] else "ws", "ready": True}
                response = Response(b"")
                case.change(data, response)
                response.data = json.dumps(data).encode()
                return response
            def close(self):
                pass
        return Connection()

    def test_two_exact_ports_proofs_independent_nonces_and_channels(self):
        self.assertTrue(DeviceChannelProbe(self.hub.public_origin, connection_factory=self.factory)(self.device))
        self.assertEqual([call[1] for call in self.calls], [self.device["http_port"], self.device["ws_port"]])
        self.assertNotEqual(self.calls[0][4], self.calls[1][4])
        for host, port, timeout, method, path, headers in self.calls:
            self.assertEqual((host, timeout, method), ("127.0.0.1", 2, "GET"))
            self.assertEqual(headers["Origin"], self.hub.public_origin)
            self.assertEqual(headers["Host"], "app.example.test")
            self.assertEqual(headers["X-CE-Device-Proof"], self.device["proxy_secret"])

    def test_replay_other_identity_wrong_channel_types_extra_and_not_ready_reject(self):
        for field, value in (("nonce", "replayed"), ("device_id", "b" * 24), ("generation", 2),
                             ("generation", True), ("platform_installation_id", "other"), ("channel", "ws"),
                             ("ready", False), ("ready", 1), ("extra", "forbidden")):
            with self.subTest(field=field, value=value):
                self.change = lambda data, response: data.update({field: value})
                self.assertFalse(DeviceChannelProbe(self.hub.public_origin, connection_factory=self.factory)(self.device))

    def test_redirect_content_type_and_oversize_are_rejected(self):
        for attribute, value in (("status", 302), ("content_type", "text/html")):
            self.change = lambda data, response: setattr(response, attribute, value)
            self.assertFalse(DeviceChannelProbe(self.hub.public_origin, connection_factory=self.factory)(self.device))
        self.change = lambda data, response: data.update(nonce="x" * 5000)
        self.assertFalse(DeviceChannelProbe(self.hub.public_origin, connection_factory=self.factory)(self.device))

    def test_one_live_channel_and_duplicate_json_are_rejected(self):
        self.change = lambda data, response: data.update(ready=data["channel"] == "http")
        self.assertFalse(DeviceChannelProbe(self.hub.public_origin, connection_factory=self.factory)(self.device))
        self.assertEqual(len(self.calls), 2)
        self.change = lambda data, response: None
        def duplicates(*args, **kwargs):
            connection = self.factory(*args, **kwargs)
            original = connection.getresponse
            def response():
                result = original()
                result.data = result.data[:-1] + b',"ready":true}'
                return result
            connection.getresponse = response
            return connection
        self.assertFalse(DeviceChannelProbe(self.hub.public_origin, connection_factory=duplicates)(self.device))

    def test_absolute_deadline_interrupts_a_dripping_body(self):
        interrupted = threading.Event()
        class SlowConnection:
            def __init__(self, *args, **kwargs):
                self.sock = self
            def shutdown(self, how):
                interrupted.set()
            def request(self, *args, **kwargs):
                pass
            def getresponse(self):
                return self
            status = 200
            def getheader(self, name, default=None):
                return "application/json" if name == "Content-Type" else default
            def read(self, length):
                interrupted.wait(4)
                return b"{}"
            def close(self):
                pass
        started = time.monotonic()
        self.assertFalse(DeviceChannelProbe(self.hub.public_origin, connection_factory=SlowConnection)(self.device))
        self.assertTrue(interrupted.is_set())
        self.assertLess(time.monotonic() - started, 3.5)
