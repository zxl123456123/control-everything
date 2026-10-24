"""Fixed introspection, key format and real local SSHSIG verification tests."""

import base64
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest

from control_everything.integrations.remote_hub.identity import (
    HubError, NAMESPACE, SSHSignatureVerifier, TokenIntrospector, public_key_fingerprint,
)
from .test_remote_hub_support import KEY


class IdentityTests(unittest.TestCase):
    def queued_cache_rejection(self, expires, resumed_at):
        now, calls = [1000], []
        data = self.data(); data["exp"] = expires
        validator = self.introspector(data, now)
        def request(token):
            calls.append(token)
            return data if len(calls) == 1 else dict(data, active=False)
        validator.transport = request
        validator.authenticate("synthetic-access-token", "desktop")
        lock, waiting = threading.Lock(), threading.Event()
        class ObservedLock:
            def __enter__(self):
                waiting.set()
                lock.acquire()
            def __exit__(self, *args):
                lock.release()
        validator._lock = ObservedLock()
        lock.acquire()
        with ThreadPoolExecutor(1) as pool:
            future = pool.submit(validator.authenticate, "synthetic-access-token", "desktop")
            try:
                self.assertTrue(waiting.wait(2), "worker must reach lock acquisition")
                now[0] = resumed_at
            finally:
                lock.release()
            with self.assertRaises(HubError):
                future.result(timeout=2)
        self.assertEqual(len(calls), 2, "expired cached result must be re-introspected")

    def test_lock_wait_cannot_accept_cache_after_token_expiry(self):
        self.queued_cache_rejection(1001, 1100)

    def test_lock_wait_cannot_accept_cache_after_30_seconds(self):
        self.queued_cache_rejection(2000, 1030)

    def test_transport_crossing_expiry_cannot_return_identity(self):
        now = [1000]
        data = self.data(); data["exp"] = 1001
        validator = self.introspector(data, now)
        def request(token):
            now[0] = 1002
            return data
        validator.transport = request
        with self.assertRaises(HubError):
            validator.authenticate("synthetic-access-token", "desktop")
        self.assertEqual(validator._cache, {})

    def test_slow_transport_preserves_query_start_cache_deadline(self):
        now, calls = [1000], []
        data = self.data()
        validator = self.introspector(data, now)
        def request(token):
            calls.append(token)
            if len(calls) == 1:
                now[0] = 1029
                return data
            return dict(data, active=False)
        validator.transport = request
        validator.authenticate("synthetic-access-token", "desktop")
        now[0] = 1030
        with self.assertRaises(HubError):
            validator.authenticate("synthetic-access-token", "desktop")
        self.assertEqual(len(calls), 2)

    def test_transport_outliving_30_second_window_is_not_trusted(self):
        now = [1000]
        data = self.data()
        validator = self.introspector(data, now)
        def request(token):
            now[0] = 1030
            return data
        validator.transport = request
        with self.assertRaises(HubError):
            validator.authenticate("synthetic-access-token", "desktop")
        self.assertEqual(validator._cache, {})

    def introspector(self, data, now=None):
        return TokenIntrospector("https://id.example.test/realms/test", "hub", "synthetic-secret",
                                 clock=lambda: (now or [1000])[0], transport=lambda token: data)

    def data(self, **changes):
        return dict(active=True, sub="account-a", aud=["workbench-hub"], azp="workbench-desktop", exp=2000, **changes)

    def test_active_sub_audience_client_and_exp_are_required(self):
        for key, value in (("active", False), ("sub", ""), ("aud", ["wrong"]),
                           ("azp", "workbench-web"), ("exp", 999), ("iss", "https://evil.test")):
            data = self.data(); data[key] = value
            with self.subTest(key=key), self.assertRaises(HubError):
                self.introspector(data).authenticate("synthetic-access-token", "desktop")

    def test_cache_expires_after_30_seconds_and_failure_does_not_extend(self):
        now, calls = [1000], []
        current = self.data()
        def request(token):
            calls.append(token)
            if len(calls) > 1:
                raise OSError("synthetic unavailable")
            return current
        validator = self.introspector(current, now)
        validator.transport = request
        validator.authenticate("synthetic-access-token", "desktop")
        now[0] = 1029
        validator.authenticate("synthetic-access-token", "desktop")
        self.assertEqual(len(calls), 1)
        now[0] = 1030
        with self.assertRaises(HubError):
            validator.authenticate("synthetic-access-token", "desktop")
        with self.assertRaises(HubError):
            validator.authenticate("synthetic-access-token", "desktop")
        self.assertEqual(len(calls), 3)

    def test_cache_cannot_outlive_exp_or_cross_client(self):
        now = [1000]
        data = self.data(); data["exp"] = 1001
        validator = self.introspector(data, now)
        validator.authenticate("synthetic-access-token", "desktop")
        with self.assertRaises(HubError):
            validator.authenticate("synthetic-access-token", "browser")
        now[0] = 1001
        with self.assertRaises(HubError):
            validator.authenticate("synthetic-access-token", "desktop")

    def test_trusted_sub_must_equal_introspected_sub(self):
        with self.assertRaises(HubError):
            self.introspector(self.data()).authenticate("synthetic-access-token", "desktop", "forged-sub")

    def test_audience_client_fail_403_and_verified_name_uses_sub_fallback(self):
        data = self.data(); data["aud"] = ["wrong"]
        with self.assertRaises(HubError) as caught:
            self.introspector(data).authenticate("synthetic-access-token", "desktop")
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(self.introspector(self.data()).authenticate("synthetic-access-token", "desktop").name, "account-a")
        data = self.data(); data["preferred_username"] = "Friendly name"
        result = self.introspector(data).authenticate("synthetic-access-token", "desktop")
        self.assertEqual((result.name, result.sub), ("Friendly name", "account-a"))

    def test_public_key_options_comments_newlines_and_wrong_length_are_rejected(self):
        self.assertTrue(public_key_fingerprint(KEY).startswith("SHA256:"))
        for key in (KEY + " comment", KEY + "\n", "restrict " + KEY,
                    "ssh-ed25519 " + base64.b64encode(b"not-an-ssh-key").decode()):
            with self.subTest(key=key), self.assertRaises(HubError):
                public_key_fingerprint(key)

    def test_real_local_sshsig_accepts_only_original_payload_and_namespace(self):
        executable = shutil.which("ssh-keygen")
        self.assertIsNotNone(executable, "local SSHSIG verification requires ssh-keygen")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generated = subprocess.run([executable, "-q", "-t", "ed25519", "-N", "", "-C", "", "-f", str(root / "key")],
                                       capture_output=True, check=False)
            self.assertEqual(generated.returncode, 0, generated.stderr)
            payload = b'{"operation":"bind","expected_credential_revision":0}'
            (root / "payload").write_bytes(payload)
            signed = subprocess.run([executable, "-Y", "sign", "-n", NAMESPACE, "-f", str(root / "key"), str(root / "payload")],
                                    capture_output=True, check=False)
            self.assertEqual(signed.returncode, 0, signed.stderr)
            public_key = " ".join((root / "key.pub").read_text().split()[:2])
            signature = (root / "payload.sig").read_text()
            verifier = SSHSignatureVerifier(executable)
            verifier.verify(payload, public_key, signature)
            with self.assertRaises(HubError):
                verifier.verify(payload.replace(b"bind", b"recover"), public_key, signature)
