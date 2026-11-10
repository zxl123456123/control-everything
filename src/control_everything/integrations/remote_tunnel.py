"""Own only the foreground SSH process created for this remote workbench."""

from dataclasses import dataclass
from pathlib import Path
import re
import threading
import time
import uuid

from control_everything.platform.windows_jobs import ProcessError, WindowsAPI


@dataclass(frozen=True)
class TunnelConfig:
    executable: Path
    config_file: Path
    alias: str
    remote_http_port: int
    remote_ws_port: int

    def __post_init__(self):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", self.alias):
            raise ValueError("remote_ssh_alias_invalid")
        for port in (self.remote_http_port, self.remote_ws_port):
            if type(port) is not int or not 1024 <= port <= 65535:
                raise ValueError("remote_ssh_port_invalid")
        if self.remote_http_port == self.remote_ws_port:
            raise ValueError("remote_ssh_port_conflict")

    def command(self, http_port, ws_port):
        for port in (http_port, ws_port):
            if type(port) is not int or not 1 <= port <= 65535:
                raise ValueError("remote_local_port_invalid")
        return [str(self.executable), "-F", str(self.config_file), "-N", "-T", "-a", "-x",
                "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=15",
                "-o", "ServerAliveCountMax=3", "-o", "ConnectTimeout=15",
                "-o", "ControlMaster=no", "-o", "ControlPath=none", "-o", "ControlPersist=no",
                "-o", "PermitLocalCommand=no", "-o", "IdentityAgent=none", "-o", "ForkAfterAuthentication=no",
                "-R", f"127.0.0.1:{self.remote_http_port}:127.0.0.1:{http_port}",
                "-R", f"127.0.0.1:{self.remote_ws_port}:127.0.0.1:{ws_port}", self.alias]


class RemoteTunnel:
    def __init__(self, config, *, api=None):
        self.config = config
        self.api = api
        self.process = self._job = self._stdin = self._stdout = None
        self._reader = None
        self._reader_stop = threading.Event()
        self._reader_failed = threading.Event()

    @property
    def running(self):
        return (self.process is not None and not self._reader_failed.is_set()
                and self.api.exit_code(self.process) == 259)

    def start(self, http_port, ws_port):
        if self.process is not None or self._job is not None:
            raise ValueError("remote_tunnel_already_started")
        command = self.config.command(http_port, ws_port)
        self.api = self.api or WindowsAPI()
        self._reader_stop.clear()
        self._reader_failed.clear()
        thread, child = None, ()
        try:
            self._job = self.api.create_job("Local\\ControlEverything.RemoteTunnel." + uuid.uuid4().hex)
            self._stdin, self._stdout, child = self.api.pipes()
            self.process, thread, _ = self.api.spawn(self.config.executable, command[1:],
                                                    self.config.config_file.parent, child)
            # The existing primitive creates suspended; forwarding cannot start before assignment.
            self.api.assign(self._job, self.process)
            self.api.resume(thread)
            self.api.close(self._stdin)
            self._stdin = None
            self._reader = threading.Thread(target=self._drain, name="workbench-ssh-output", daemon=True)
            self._reader.start()
            # This catches immediate failures only; it does not assert remote readiness.
            time.sleep(.2)
            if not self.running:
                raise ProcessError("remote_tunnel_start_failed")
        except BaseException:
            try:
                if self.process is not None:
                    self.api.terminate_process(self.process)
            finally:
                self.close()
            raise
        finally:
            self.api.close(thread)
            for handle in child:
                self.api.close(handle)

    def _drain(self):
        eof = False
        try:
            while not self._reader_stop.is_set():
                output = self.api.read_available(self._stdout)
                if output == b"":
                    # OpenSSH -N may close stdout while its forwarding process remains live.
                    eof = True
                    break
                if output is None:
                    self._reader_stop.wait(.02)
        except (ProcessError, OSError):
            pass
        finally:
            if not eof and not self._reader_stop.is_set():
                self._reader_failed.set()

    def close(self):
        if self.api is None:
            return
        self._reader_stop.set()
        reader_failure = False
        try:
            try:
                if self._reader is not None and self._reader.ident is not None:
                    self._reader.join(timeout=1)
                    reader_failure = self._reader.is_alive()
            finally:
                if self._job is not None:
                    self.api.terminate_job(self._job)
                    deadline = time.monotonic() + 2
                    while self.api.active(self._job):
                        if time.monotonic() >= deadline:
                            raise ProcessError("remote_tunnel_cleanup_unverified")
                        time.sleep(.02)
            if reader_failure:
                raise ProcessError("remote_tunnel_reader_unverified")
        finally:
            # Closing this non-inherited Job also contains hard-killed Python owners.
            for handle in (self.process, self._stdin, self._stdout, self._job):
                self.api.close(handle)
            self.process = self._stdin = self._stdout = self._job = self._reader = None
