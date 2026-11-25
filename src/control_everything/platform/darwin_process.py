"""Owned subprocesses and advisory profile locks for the macOS workbench."""

from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import signal
import stat
import subprocess

from control_everything.platform.windows_jobs import ProcessError


def owned_runtime_socket(endpoint, state, pid, runtime_id):
    """Match the engine's existing per-uid short daemon socket contract."""
    suffix = ''.join(char for char in runtime_id if char.isascii() and (char.isalnum() or char in '_-'))[:4] or 'rt'
    name = f'o-{pid}-{suffix}.sock'
    preferred = str(state / name)
    expected = preferred
    if len(preferred.encode('utf-8')) > 103:
        uid = os.getuid()
        runtime_hash = hashlib.sha256(str(state).encode()).hexdigest()[:12]
        base = Path('/tmp') / f'.orca-daemon-{uid}'
        expected = str(base / runtime_hash / name)
        # Resolve only macOS's system /tmp alias; every private component stays no-follow.
        base = Path('/tmp').resolve() / base.name
        for directory in (base, base / runtime_hash):
            info = directory.lstat()
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
                raise ProcessError('runtime_socket_untrusted')
        actual = base / runtime_hash / name
    else:
        actual = Path(endpoint)
    if endpoint != expected:
        raise ProcessError('runtime_socket_untrusted')
    info = actual.lstat()
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
        raise ProcessError('runtime_socket_untrusted')
    return endpoint


class ProcessGroup(list):
    def __bool__(self):
        return True


class DarwinAPI:
    def owner(self, path):
        import fcntl
        stream = open(path, 'a+b')
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            stream.close()
            return None
        return stream

    def create_job(self, name):
        return ProcessGroup()

    def launch(self, executable, argv, cwd, env, job, *, identity=True):
        process = subprocess.Popen([str(executable), *map(str, argv)], cwd=cwd, env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, start_new_session=True, bufsize=0)
        job.append(process)
        os.set_blocking(process.stdout.fileno(), False)
        try:
            created = self.process_creation_time(process) if identity else None
        except BaseException:
            self.terminate_process(process)
            process.stdin.close()
            process.stdout.close()
            raise
        return process, process.stdin, process.stdout, process.pid, created

    def process_creation_time(self, process):
        result = subprocess.run(['/bin/ps', '-p', str(process.pid), '-o', 'lstart='],
                                capture_output=True, text=True, timeout=2, check=True,
                                env={**os.environ, 'LC_ALL': 'C', 'TZ': 'UTC'})
        try:
            return int(datetime.strptime(result.stdout.strip(), '%a %b %d %H:%M:%S %Y')
                       .replace(tzinfo=timezone.utc).timestamp() * 1000)
        except ValueError:
            raise ProcessError('process_identity_unavailable') from None

    def exit_code(self, process):
        code = process.poll()
        return 259 if code is None else code

    def read_available(self, stream):
        try:
            return os.read(stream.fileno(), 65536)
        except BlockingIOError:
            return None

    def write(self, stream, raw):
        return stream.write(raw)

    def terminate_process(self, process):
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)

    def terminate_job(self, job):
        for process in job:
            # Only signal groups whose leader is still our unreaped child.
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)

    def active(self, job):
        active = 0
        for process in job:
            process.poll()
            try:
                os.killpg(process.pid, 0)
                active += 1
            except ProcessLookupError:
                pass
        return active

    def close(self, handle):
        if handle is None or isinstance(handle, list):
            return
        if isinstance(handle, subprocess.Popen):
            handle.poll()
        else:
            handle.close()
