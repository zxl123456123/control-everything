"""Fail-closed ownership checks for the dedicated sshd's connection subtrees."""

from dataclasses import dataclass
import os
from pathlib import Path
import signal
import time

from .identity import HubError


@dataclass(frozen=True)
class Process:
    pid: int
    parent: int
    uid: int
    starttime: int
    cgroup: str


class LinuxProcessInspector:
    def __init__(self, *, proc_root="/proc", master_pid_file="/run/ce-device-sshd.pid",
                 cgroup="/system.slice/ce-device-sshd.service", clock=time.monotonic):
        self.proc = Path(proc_root)
        self.master_pid_file, self.cgroup, self.clock = Path(master_pid_file), cgroup, clock

    def read(self, pid):
        root = self.proc / str(pid)
        group = (root / "cgroup").read_text().strip()
        if group != "0::" + self.cgroup:
            raise HubError("foreign_process_cgroup", 503)
        stat = (root / "stat").read_text()
        fields = stat[stat.rfind(")") + 2:].split()
        uid_line = next(line for line in (root / "status").read_text().splitlines() if line.startswith("Uid:"))
        uids = [int(item) for item in uid_line.split()[1:]]
        if len(set(uids)) != 1:
            raise HubError("ambiguous_process_uid", 503)
        return Process(pid, int(fields[1]), uids[0], int(fields[19]), group)

    def snapshot(self):
        master = int(self.master_pid_file.read_text().strip())
        master_record = self.read(master)
        if master_record.uid != 0:
            raise HubError("invalid_sshd_master", 503)
        records = {}
        for directory in self.proc.iterdir():
            if not directory.name.isdigit():
                continue
            try:
                record = self.read(int(directory.name))
            except FileNotFoundError:
                continue
            except HubError as error:
                if error.code == "foreign_process_cgroup":
                    continue
                raise
            records[record.pid] = record
        if records.get(master) != master_record:
            raise HubError("sshd_master_changed", 503)
        return master, records

    @staticmethod
    def connection_processes(master, records, uid):
        """Only a root monitor directly under master with a proven dedicated uid is killable."""
        selected = {}
        for monitor in records.values():
            if monitor.parent != master or monitor.uid != 0:
                continue
            descendants = {monitor.pid}
            while True:
                expanded = descendants | {item.pid for item in records.values() if item.parent in descendants}
                if expanded == descendants:
                    break
                descendants = expanded
            if not any(records[pid].uid != 0 for pid in descendants):
                # A root-only connection monitor may be a disappearing device session.
                # Its owner is unknown, so neither kill it nor release a device's ports.
                raise HubError("unattributed_privsep_monitor", 503)
        targets = [record for record in records.values() if record.uid == uid]
        for record in targets:
            chain, current = [], record
            while current.pid != master:
                if current.pid in {item.pid for item in chain} or current.parent not in records:
                    raise HubError("ambiguous_process_ancestry", 503)
                chain.append(current)
                current = records[current.parent]
            if not chain or any(item.uid not in (0, uid) for item in chain):
                raise HubError("mixed_device_process_tree", 503)
            monitor = chain[-1]
            if monitor.uid != 0 or monitor.parent != master:
                raise HubError("ambiguous_privsep_monitor", 503)
            descendants = {monitor.pid: monitor}
            changed = True
            while changed:
                changed = False
                for item in records.values():
                    if item.parent in descendants and item.pid not in descendants:
                        if item.uid not in (0, uid):
                            raise HubError("mixed_device_process_tree", 503)
                        descendants[item.pid] = item
                        changed = True
            selected.update(descendants)
        return selected

    def listeners(self, ports):
        count = 0
        for filename in ("tcp", "tcp6"):
            for line in (self.proc / "net" / filename).read_text().splitlines()[1:]:
                fields = line.split()
                if fields[3] == "0A" and int(fields[1].split(":")[1], 16) in ports:
                    count += 1
        return count

    def inspect(self, uid, ports):
        master, records = self.snapshot()
        selected = self.connection_processes(master, records, uid)
        return {"connections": len(selected), "listeners": self.listeners(ports)}

    def terminate(self, uid, ports):
        if not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
            raise HubError("pidfd_required", 503)
        deadline = self.clock() + 4
        while self.clock() < deadline:
            master, records = self.snapshot()
            selected = self.connection_processes(master, records, uid)
            if not selected:
                if self.listeners(ports):
                    raise HubError("unattributed_listener", 503)
                return {"connections": 0, "listeners": 0}
            # Open handles first, then revalidate every record before signaling any.
            handles = []
            try:
                for record in selected.values():
                    try:
                        handle = os.pidfd_open(record.pid)
                    except ProcessLookupError:
                        continue
                    handles.append((record, handle))
                for record, _ in handles:
                    try:
                        if self.read(record.pid) != record:
                            raise HubError("process_identity_changed", 503)
                    except FileNotFoundError:
                        continue
                for _, handle in handles:
                    try:
                        signal.pidfd_send_signal(handle, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            finally:
                for _, handle in handles:
                    os.close(handle)
            time.sleep(0.05)
        raise HubError("device_cleanup_timeout", 503)
