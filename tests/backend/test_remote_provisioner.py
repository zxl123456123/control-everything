"""Fake process ownership and narrow protocol tests; no privileged operations."""

import json
import os
from contextlib import contextmanager
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from control_everything.integrations.remote_hub.identity import HubError
from control_everything.integrations.remote_hub.linux_processes import LinuxProcessInspector, Process
from control_everything.integrations.remote_hub.linux_provisioner import LinuxDeviceProvisioner
from control_everything.integrations.remote_hub.provisioner import validate_request
from .test_remote_hub_support import KEY

GROUP = "0::/system.slice/ce-device-sshd.service"


@contextmanager
def fake_private_root_metadata(directory):
    original = Path.stat
    def read(path, *args, **kwargs):
        result = original(path, *args, **kwargs)
        if path == Path(directory):
            values = list(result)
            values[0], values[4] = (values[0] & ~0o777) | 0o755, 0
            return os.stat_result(values)
        return result
    with patch.object(Path, "stat", new=read):
        yield


class ProvisionerTests(unittest.TestCase):
    def proc_fixture(self, root, pid, parent, uid, *, cgroup=GROUP):
        directory = root / str(pid)
        directory.mkdir()
        fields = ["S", str(parent)] + ["0"] * 17 + [str(100 + pid)]
        (directory / "stat").write_text(str(pid) + " (sshd) " + " ".join(fields))
        (directory / "status").write_text("Uid:\t" + "\t".join(map(str, uid)) + "\n")
        (directory / "cgroup").write_text(cgroup + "\n")

    def test_snapshot_ignores_foreign_mixed_uid_but_rejects_managed_mixed_uid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pid_file = root / "master.pid"
            pid_file.write_text("1")
            self.proc_fixture(root, 1, 0, (0, 0, 0, 0))
            self.proc_fixture(root, 2, 1, (0, 0, 0, 0))
            self.proc_fixture(root, 3, 2, (1001, 1001, 1001, 1001))
            self.proc_fixture(root, 99, 0, (1000, 0, 0, 0), cgroup="0::/user.slice/unrelated.service")
            inspector = LinuxProcessInspector(proc_root=root, master_pid_file=pid_file)
            master, records = inspector.snapshot()
            self.assertEqual(set(records), {1, 2, 3})
            self.assertEqual(set(inspector.connection_processes(master, records, 1001)), {2, 3})
            (root / "99" / "cgroup").write_text(GROUP)
            with self.assertRaises(HubError) as caught:
                inspector.snapshot()
            self.assertEqual(caught.exception.code, "ambiguous_process_uid")

    def test_fake_linux_account_operations_are_idempotent_and_disable_is_permanent(self):
        accounts, calls = {}, []
        def lookup(name):
            if name not in accounts:
                raise KeyError(name)
            return accounts[name]
        def run(arguments, **kwargs):
            calls.append(arguments)
            accounts[arguments[-1]] = SimpleNamespace(pw_uid=1001, pw_shell="/usr/sbin/nologin")
            return SimpleNamespace(returncode=0)
        with tempfile.TemporaryDirectory() as directory, patch("os.geteuid", return_value=0, create=True), \
                fake_private_root_metadata(directory), \
                patch("control_everything.integrations.remote_hub.linux_provisioner.pwd", SimpleNamespace(getpwnam=lookup)):
            backend = LinuxDeviceProvisioner(directory, runner=run)
            backend.ensure_device("a" * 24, KEY, 20000, 20001)
            backend.ensure_device("a" * 24, KEY, 20000, 20001)
            self.assertEqual(len(calls), 1)
            key = (Path(directory) / "keys" / ("ced_" + "a" * 24)).read_text()
            self.assertIn('permitlisten="127.0.0.1:20000"', key)
            self.assertIn('permitlisten="127.0.0.1:20001"', key)
            backend.disable_device("a" * 24)
            self.assertEqual((Path(directory) / "keys" / ("ced_" + "a" * 24)).read_text(), "")
            with self.assertRaises(HubError):
                backend.ensure_device("a" * 24, KEY, 20000, 20001)

    def test_existing_unowned_account_and_live_disabled_ports_are_rejected(self):
        def lookup(name):
            return SimpleNamespace(pw_uid=1001, pw_shell="/usr/sbin/nologin")
        with tempfile.TemporaryDirectory() as directory, patch("os.geteuid", return_value=0, create=True), \
                fake_private_root_metadata(directory), \
                patch("control_everything.integrations.remote_hub.linux_provisioner.pwd", SimpleNamespace(getpwnam=lookup)):
            backend = LinuxDeviceProvisioner(directory)
            with self.assertRaises(HubError) as caught:
                backend.ensure_device("a" * 24, KEY, 20000, 20001)
            self.assertEqual(caught.exception.code, "existing_unowned_account")
            (Path(directory) / ("b" * 24 + ".json")).write_text(json.dumps({"uid": 1002,
                "http_port": 20000, "ws_port": 20001, "disabled": True}))
            backend.processes = SimpleNamespace(inspect=lambda uid, ports: {"connections": 1, "listeners": 1})
            with self.assertRaises(HubError) as caught:
                backend.ensure_device("a" * 24, KEY, 20000, 20001)
            self.assertEqual(caught.exception.code, "device_port_conflict")

    def test_strict_protocol_rejects_commands_paths_uids_and_port_injection(self):
        request = dict(operation="ensure_device", device_id="a" * 24, public_key=KEY, http_port=20000, ws_port=20001)
        self.assertEqual(validate_request(request), "ensure_device")
        for key, value in (("command", "id"), ("uid", 0), ("path", "/etc/passwd"),
                           ("device_id", "../../root"), ("http_port", "20000;id"),
                           ("ws_port", 22), ("public_key", KEY + "\ncommand=bad")):
            bad = dict(request); bad[key] = value
            with self.subTest(key=key), self.assertRaises(HubError):
                validate_request(bad)

    def records(self):
        return {1: Process(1, 0, 0, 100, GROUP), 10: Process(10, 1, 0, 101, GROUP),
                11: Process(11, 10, 1001, 102, GROUP), 20: Process(20, 1, 0, 103, GROUP),
                21: Process(21, 20, 1002, 104, GROUP)}

    def test_only_owned_privsep_connection_subtree_is_selected(self):
        selected = LinuxProcessInspector.connection_processes(1, self.records(), 1001)
        self.assertEqual(set(selected), {10, 11})
        self.assertNotIn(1, selected)
        self.assertNotIn(20, selected)

    def test_mixed_owner_and_missing_ancestry_fail_closed(self):
        records = self.records()
        records[12] = Process(12, 10, 1002, 105, GROUP)
        with self.assertRaises(HubError):
            LinuxProcessInspector.connection_processes(1, records, 1001)

    def test_unattributed_root_monitor_prevents_port_release(self):
        records = self.records()
        del records[11]
        with self.assertRaises(HubError) as caught:
            LinuxProcessInspector.connection_processes(1, records, 1001)
        self.assertEqual(caught.exception.code, "unattributed_privsep_monitor")
        records = self.records(); del records[10]
        with self.assertRaises(HubError):
            LinuxProcessInspector.connection_processes(1, records, 1001)

    def test_pid_reuse_is_detected_before_any_signal(self):
        inspector = LinuxProcessInspector()
        inspector.snapshot = lambda: (1, self.records())
        inspector.read = lambda pid: Process(pid, 1, 0, 99999, GROUP)
        signals = []
        with patch("os.pidfd_open", return_value=123, create=True), patch("os.close"), \
                patch("signal.pidfd_send_signal", side_effect=lambda *args: signals.append(args), create=True):
            with self.assertRaises(HubError) as caught:
                inspector.terminate(1001, {20000, 20001})
        self.assertEqual(caught.exception.code, "process_identity_changed")
        self.assertEqual(signals, [])

    def test_exited_pid_is_tolerated_without_signaling_an_unrelated_process(self):
        inspector = LinuxProcessInspector()
        states = [(1, self.records()), (1, {1: self.records()[1]})]
        inspector.snapshot = lambda: states.pop(0)
        inspector.listeners = lambda ports: 0
        with patch("os.pidfd_open", side_effect=ProcessLookupError, create=True), \
                patch("signal.pidfd_send_signal", create=True) as signal_call, patch("time.sleep"):
            self.assertEqual(inspector.terminate(1001, {20000, 20001}), {"connections": 0, "listeners": 0})
        signal_call.assert_not_called()
