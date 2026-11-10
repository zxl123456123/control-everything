"""Pure policy and socket-free HTTP tests for the explicit remote instance."""

from email.message import Message
import unittest

from control_everything.integrations.remote_access import RemoteAccess, public_origin

SECRET = "A" * 43
ORIGIN = "https://workbench.example.test"


class RemoteAccessTests(unittest.TestCase):

    def test_only_canonical_https_origin(self):
        for value in (ORIGIN, "https://192.0.2.1", "https://[2001:db8::1]:8443"):
            self.assertEqual(public_origin(value), value)
        for value in (None, "", "http://example.test", ORIGIN + "/", ORIGIN + "?", ORIGIN + "#",
                      ORIGIN + ":443", "HTTPS://workbench.example.test", "https://EXAMPLE.test",
                      "https://u:p@example.test", "https://example.test:0", "https://example.test:65536",
                      "https://example.test/other", "https://example.test\n", "https://example..test",
                      "https://127.1", "https://0177.0.0.1", "https://0x7f000001", "https://例子.test",
                      "https://[fe80::1%25en0]"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                public_origin(value)

    def test_secret_is_required_canonical_and_not_printable(self):
        remote = RemoteAccess(ORIGIN, SECRET)
        self.assertNotIn(SECRET, repr(remote))
        self.assertEqual(remote.websocket_endpoint, "wss://workbench.example.test/workbench-runtime")
        for secret in (None, "", "short", "a" * 42, "!" * 43, "A" * 42 + "B", "A" * 44 + "="):
            with self.subTest(secret=secret), self.assertRaises(ValueError):
                RemoteAccess(ORIGIN, secret)

    def test_proxy_proof_does_not_trust_forwarded_headers(self):
        remote = RemoteAccess(ORIGIN, SECRET)
        headers = Message()
        headers["Host"], headers["X-CE-Device-Proof"] = remote.authority, SECRET
        self.assertTrue(remote.accept_proxy_request(headers))
        headers["Forwarded"] = 'host=localhost;proto=http'
        headers["X-Forwarded-Host"] = 'localhost'
        self.assertTrue(remote.accept_proxy_request(headers))
        for name, value in (("Host", remote.authority), ("X-CE-Device-Proof", SECRET),
                            ("Origin", "null"), ("Origin", ""), ("Origin", ORIGIN + ", " + ORIGIN)):
            copy = Message()
            copy["Host"], copy["X-CE-Device-Proof"] = remote.authority, SECRET
            copy[name] = value
            self.assertFalse(remote.accept_proxy_request(copy))


