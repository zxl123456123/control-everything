"""Own one workspace runtime; browser requests never select executables."""

from dataclasses import dataclass, field
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import threading
import time
from urllib.parse import urlsplit
import uuid

from control_everything.platform.windows_jobs import ProcessError, WindowsAPI
from control_everything.integrations.remote_access import public_origin

MAX_MESSAGE = 1024 * 1024


class WorkbenchUnavailable(Exception):
    def __init__(self, code="runtime_unavailable"):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class RuntimeConfig:
    engine_root: Path
    build_run: Path
    data_root: Path
    git_executable: Path
    allowed_workspace_roots: tuple[Path, ...]
    public_origin: str | None = None
    device_proof: str | None = field(default=None, repr=False)
    remote_device_id: str | None = None
    remote_generation: int | None = None
    platform_installation_id: str | None = None
    inherit_host_environment: bool = False
    credential_root: Path | None = None


def safe_path(value):
    path = Path(value)
    if not path.is_absolute():
        raise WorkbenchUnavailable("runtime_path_invalid")
    for item in (path, *path.parents):
        if not item.exists() and not item.is_symlink():
            continue
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise WorkbenchUnavailable("runtime_path_invalid")
    return path.resolve()


def read_json(path, limit=MAX_MESSAGE):
    path = safe_path(path)
    if path.stat().st_size > limit:
        raise WorkbenchUnavailable("runtime_protocol_error")
    with path.open("rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise WorkbenchUnavailable("runtime_protocol_error")
    return json.loads(raw)


def digest(path):
    with safe_path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def loopback_origin(value, scheme="http"):
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except (TypeError, ValueError):
        raise WorkbenchUnavailable("runtime_origin_invalid") from None
    if (parsed.scheme != scheme or parsed.hostname != "127.0.0.1" or not port
            or parsed.username or parsed.password or parsed.path not in {"", "/"}
            or parsed.query or parsed.fragment):
        raise WorkbenchUnavailable("runtime_origin_invalid")
    return f"{scheme}://127.0.0.1:{port}"


def workbench_environment(data_root, node, git, origin, ambient=None, *, remote_origin=None,
                          device_proof=None, inherit_host_environment=False, credential_root=None):
    ambient = os.environ if ambient is None else ambient
    system = ambient.get("SystemRoot") or ambient.get("SYSTEMROOT")
    if not system or not Path(system).is_absolute():
        raise WorkbenchUnavailable("runtime_system_environment_missing")
    home = data_root / "home"
    # The pinned node-pty path_util.cc drops the final PATH segment when resolving
    # bare shell names. Keep System32 delimiter-terminated; ordinary Git lookup
    # still consumes the final explicit directory. Never add an empty segment.
    env = {"SystemRoot": system, "WINDIR": system, "ComSpec": str(Path(system) / "System32/cmd.exe"),
           "PATHEXT": ".COM;.EXE;.BAT;.CMD", "HOMEDRIVE": home.drive, "HOMEPATH": str(home)[len(home.drive):],
           "PATH": os.pathsep.join((str(node.parent), str(Path(system) / "System32"), str(git.parent))),
           "HOME": str(home), "USERPROFILE": str(home), "APPDATA": str(home / "AppData/Roaming"),
           "LOCALAPPDATA": str(home / "AppData/Local"), "CODEX_HOME": str(home / "codex"),
           "CLAUDE_CONFIG_DIR": str(home / "claude"), "XDG_CONFIG_HOME": str(home / ".config"),
           "XDG_DATA_HOME": str(home / ".local/share"), "XDG_CACHE_HOME": str(home / ".cache"),
           "TEMP": str(data_root / "tmp"), "TMP": str(data_root / "tmp"), "TMPDIR": str(data_root / "tmp"),
           "ORCA_USER_DATA": str(data_root / "state"), "ORCA_USER_DATA_PATH": str(data_root / "state"),
           "ORCA_BACKGROUND_LAUNCH": "1", "ORCA_DISABLE_MACOS_LOGIN_SHELL": "1",
           "DO_NOT_TRACK": "1", "ORCA_TELEMETRY_DISABLED": "1", "CE_WORKBENCH_ISOLATED": "1",
           "CE_WORKBENCH_ORIGIN": loopback_origin(origin), "GIT_CONFIG_NOSYSTEM": "1",
           "GIT_CONFIG_GLOBAL": str(home / ".gitconfig")}
    if inherit_host_environment:
        # Desktop terminals use the user's tools and configuration in place. Only
        # product state and transport ownership belong to the managed runtime.
        owned = {key: env[key] for key in (
            "ORCA_USER_DATA", "ORCA_USER_DATA_PATH", "ORCA_BACKGROUND_LAUNCH",
            "ORCA_DISABLE_MACOS_LOGIN_SHELL", "DO_NOT_TRACK", "ORCA_TELEMETRY_DISABLED",
            "CE_WORKBENCH_ISOLATED", "CE_WORKBENCH_ORIGIN")}
        fallback_path = env["PATH"]
        env = dict(ambient)
        env.update(owned)
        env["PATH"] = os.pathsep.join(filter(None, (ambient.get("PATH"), fallback_path)))
        env["CE_WORKBENCH_HOST_ENVIRONMENT"] = "1"
        controlled = {"CE_WORKBENCH_CREDENTIAL_ROOT", "CE_WORKBENCH_PUBLIC_ORIGIN", "CE_WORKBENCH_DEVICE_PROOF",
                      "CE_REMOTE_DEVICE_ID", "CE_REMOTE_GENERATION", "CE_REMOTE_INSTALLATION_ID"}
        for key in tuple(env):
            if key.upper() in controlled:
                env.pop(key)
    if credential_root is not None:
        selected = safe_path(credential_root)
        state = safe_path(data_root / 'state')
        if selected == state or not selected.is_relative_to(state) or not selected.is_dir():
            raise WorkbenchUnavailable('runtime_credential_root_invalid')
        env['CE_WORKBENCH_CREDENTIAL_ROOT'] = str(selected)
    if remote_origin is not None:
        from control_everything.integrations.remote_access import RemoteAccess
        RemoteAccess(remote_origin, device_proof)
        env["CE_WORKBENCH_PUBLIC_ORIGIN"] = public_origin(remote_origin)
        env["CE_WORKBENCH_DEVICE_PROOF"] = device_proof
    return env


class WorkbenchRuntime:
    def __init__(self, config, *, api=None, owner_call=None):
        self.config, self.api, self._owner_call = config, api, owner_call
        self._lock = threading.RLock()
        self._job = self._owner = self._process = self._stdin = self._stdout = None
        self._pid = self._created = self._metadata = self._instance = None
        self._origin = self._ws_origin = self._node = self._entry = self._helper = None
        self._devices = {}
        self._reader = None
        self._reader_stop = threading.Event()
        self.cleanup_verified = False

    @property
    def ready(self):
        try:
            return bool(self._metadata and self._process and self.api.exit_code(self._process) == 259)
        except (ProcessError, OSError):
            return False

    def status(self):
        return {"ready": self.ready, "code": "ready" if self.ready else "runtime_unavailable",
                **({"runtimeId": self._metadata["runtimeId"]} if self.ready else {})}

    @property
    def websocket_origin(self):
        if not self.ready:
            raise WorkbenchUnavailable()
        return self._ws_origin

    def _prepare(self, origin):
        self._origin = loopback_origin(origin)
        root, run, data = (safe_path(value) for value in
                           (self.config.engine_root, self.config.build_run, self.config.data_root))
        actual_home = Path.home().resolve()
        if data == actual_home or actual_home.is_relative_to(data):
            raise WorkbenchUnavailable("runtime_profile_not_isolated")
        provenance = read_json(run / "build-provenance.json")
        if provenance.get("status") != "build_only_verified":
            raise WorkbenchUnavailable("runtime_build_unverified")
        rows = read_json(run / "output-manifest.json")["files"]
        files = {}
        for row in rows:
            name = row["path"]
            if not isinstance(name, str) or "\\" in name or ":" in name or ".." in Path(name).parts:
                raise WorkbenchUnavailable("runtime_build_unverified")
            if not name.startswith(("out/orcad/", "out/runtimes/")):
                continue
            file = safe_path(root / name)
            if not file.is_relative_to(root) or digest(file) != row["sha256"]:
                raise WorkbenchUnavailable("runtime_build_changed")
            files[name] = file
        marker = files.get("out/orcad/.runtime-node")
        node_sha = marker.read_text(encoding="utf-8").strip() if marker else ""
        if not re.fullmatch("[0-9a-f]{64}", node_sha):
            raise WorkbenchUnavailable("runtime_build_unverified")
        required = ["out/orcad/orcad.js", "out/orcad/platform-owner-client.js", f"out/runtimes/node-{node_sha}/node.exe"]
        if any(name not in files for name in required) or digest(files[required[2]]) != node_sha:
            raise WorkbenchUnavailable("runtime_build_unverified")
        self._entry, self._helper, self._node = (files[name] for name in required)
        version_file = files.get("out/orcad/.version")
        if not version_file:
            raise WorkbenchUnavailable("runtime_build_unverified")
        version = version_file.read_text(encoding="utf-8").strip()
        if not version or len(version) > 255 or any(char.isspace() for char in version):
            raise WorkbenchUnavailable("runtime_build_unverified")
        git = safe_path(self.config.git_executable)
        if not git.is_file() or git.name.lower() != "git.exe":
            raise WorkbenchUnavailable("runtime_git_missing")
        marker = data / ".platform-workbench-profile.json"
        if not marker.exists():
            if data.exists() and any(data.iterdir()):
                raise WorkbenchUnavailable("runtime_profile_not_isolated")
            data.mkdir(parents=True, exist_ok=True)
            with marker.open("x", encoding="utf-8") as stream:
                json.dump({"schema": 1, "kind": "isolated-workbench", "id": str(uuid.uuid4())}, stream)
        elif read_json(marker, 4096).get("kind") != "isolated-workbench":
            raise WorkbenchUnavailable("runtime_profile_not_isolated")
        self._env = workbench_environment(data, self._node, git, self._origin,
                                         remote_origin=self.config.public_origin, device_proof=self.config.device_proof,
                                         inherit_host_environment=self.config.inherit_host_environment,
                                         credential_root=self.config.credential_root)
        remote_identity = (self.config.remote_device_id, self.config.remote_generation, self.config.platform_installation_id)
        if any(value is not None for value in remote_identity):
            device, generation, installation = remote_identity
            if (not self.config.public_origin or not isinstance(device, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", device)
                    or type(generation) is not int or generation < 1 or not isinstance(installation, str)
                    or not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", installation)):
                raise WorkbenchUnavailable("runtime_remote_identity_invalid")
            self._env.update(CE_REMOTE_DEVICE_ID=device, CE_REMOTE_GENERATION=str(generation), CE_REMOTE_INSTALLATION_ID=installation)
        # Both the lock and managed-stop context read this variable, with different
        # upstream fallbacks. Pin it to the verified artifact so their identities agree.
        self._env["ORCA_VERSION"] = version
        directory_keys = ("ORCA_USER_DATA",)
        if not self.config.inherit_host_environment:
            directory_keys += ("HOME", "APPDATA", "LOCALAPPDATA", "CODEX_HOME", "CLAUDE_CONFIG_DIR",
                               "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "TEMP")
        for key in directory_keys:
            safe_path(self._env[key]).mkdir(parents=True, exist_ok=True)
        for relative in (() if self.config.inherit_host_environment else ("home/.ssh/config", "home/.gitconfig")):
            file = safe_path(data / relative)
            file.parent.mkdir(parents=True, exist_ok=True)
            if not file.exists():
                file.write_text("", encoding="utf-8")
        safe_path(data / "workspaces").mkdir(exist_ok=True)
        state = safe_path(data / "state/orca-data.json")
        if not state.exists():
            state.write_text(json.dumps({"settings": {"workspaceDir": str(data / "workspaces"),
                             "agentStatusHooksEnabled": False, "nativeChatInheritShellEnvironment": False,
                             "agentStateRulesLiveUpdates": False, "localWindowsRuntimeDefault": {"kind": "windows-host"}}}), encoding="utf-8")

    def _spawn(self, argv):
        thread, child = None, ()
        process = stdin = stdout = None
        try:
            stdin, stdout, child = self.api.pipes()
            process, thread, pid = self.api.spawn(self._node, list(map(str, argv)), self.config.data_root,
                                                child, env=self._env)
            self.api.assign(self._job, process)
            created = self.api.process_creation_time(process)
            self.api.resume(thread)
            return process, stdin, stdout, pid, created
        except BaseException:
            if process:
                self.api.terminate_process(process)
            for handle in (process, stdin, stdout):
                self.api.close(handle)
            raise
        finally:
            self.api.close(thread)
            for handle in child:
                self.api.close(handle)

    def _drain(self):
        # Startup uses --no-pairing; discard stdout rather than persist auth-bearing text.
        try:
            while not self._reader_stop.is_set():
                output = self.api.read_available(self._stdout)
                if output == b"":
                    return
                if output is None:
                    self._reader_stop.wait(.02)
        except (ProcessError, OSError):
            return

    def _read_identity(self):
        state = self.config.data_root / "state"
        metadata, instance = read_json(state / "orca-runtime.json", 65536), read_json(state / "orcad.lock", 32768)
        if (metadata.get("pid") != self._pid or instance.get("pid") != self._pid
                or instance.get("startedAtMs") != self._created or not instance.get("nonce")
                or not isinstance(metadata.get("authToken"), str) or not metadata["authToken"]
                or not isinstance(metadata.get("runtimeId"), str) or not metadata["runtimeId"]
                or self.api.exit_code(self._process) != 259):
            raise WorkbenchUnavailable("runtime_identity_mismatch")
        transports = metadata.get("transports", [])
        pipe = [row["endpoint"] for row in transports if row.get("kind") == "named-pipe"]
        websocket = [row["endpoint"] for row in transports if row.get("kind") == "websocket"]
        if len(pipe) != 1 or not pipe[0].startswith("\\\\.\\pipe\\") or len(websocket) != 1:
            raise WorkbenchUnavailable("runtime_protocol_error")
        ws_origin = loopback_origin(websocket[0], "ws")
        if self._metadata and (metadata["runtimeId"] != self._metadata["runtimeId"] or instance["nonce"] != self._instance["nonce"]):
            raise WorkbenchUnavailable("runtime_identity_mismatch")
        return metadata, instance, pipe[0], ws_origin

    def start(self, origin, *, timeout=60):
        with self._lock:
            if self.ready:
                if loopback_origin(origin) != self._origin:
                    raise WorkbenchUnavailable("runtime_origin_invalid")
                self._read_identity()
                return self.status()
            if self._process:
                self._release_process()
            self.cleanup_verified = False
            self._prepare(origin)
            self.api = self.api or WindowsAPI()
            fresh_job = self._job is None
            try:
                if not self._owner:
                    self._owner = self.api.owner(self.config.data_root / ".platform-runtime-owner.lock")
                    if not self._owner:
                        raise WorkbenchUnavailable("runtime_profile_in_use")
                if fresh_job:
                    self._job = self.api.create_job("Local\\ControlEverything.Workbench." + uuid.uuid4().hex)
                self._process, self._stdin, self._stdout, self._pid, self._created = self._spawn(
                    [self._entry, "--bind", "127.0.0.1", "--port", "0", "--no-pairing", "--json"])
                self._reader_stop.clear()
                self._reader = threading.Thread(target=self._drain, name="workbench-output", daemon=True)
                self._reader.start()
                deadline = time.monotonic() + timeout
                while time.monotonic() < deadline:
                    try:
                        self._metadata, self._instance, _, self._ws_origin = self._read_identity()
                        return self.status()
                    except (FileNotFoundError, json.JSONDecodeError):
                        if self.api.exit_code(self._process) != 259:
                            break
                        time.sleep(.05)
                    except WorkbenchUnavailable as error:
                        # A crashed prior instance can leave metadata until this one publishes.
                        # It never becomes authority; only this held handle's identity can pass.
                        if error.code != "runtime_identity_mismatch":
                            raise
                        if self.api.exit_code(self._process) != 259:
                            break
                        time.sleep(.05)
                raise WorkbenchUnavailable("runtime_start_timeout")
            except BaseException:
                if self._process:
                    self.api.terminate_process(self._process)
                self._release_process()
                if fresh_job:
                    self._close_job(force=True)
                raise

    def _capture(self, argv, request=None, timeout=30, cancel_event=None):
        deadline = time.monotonic() + timeout
        process, stdin, stdout, _, _ = self._spawn(argv)
        output = bytearray()
        writer = None
        try:
            if request is not None:
                raw = (json.dumps(request, allow_nan=False) + "\n").encode()
                if len(raw) > MAX_MESSAGE:
                    raise WorkbenchUnavailable("runtime_protocol_error")
                written, write_done = [], threading.Event()
                def write_request():
                    try:
                        written.append(self.api.write(stdin, raw))
                    except (ProcessError, OSError):
                        written.append(None)
                    finally:
                        write_done.set()
                # A helper that stops reading its anonymous pipe must not pin the
                # observer in synchronous WriteFile. Terminating this owned helper
                # in finally closes its read end and releases the pending write.
                writer = threading.Thread(target=write_request, name='workbench-request-input', daemon=True)
                writer.start()
                while not write_done.is_set():
                    if cancel_event is not None and cancel_event.is_set():
                        raise WorkbenchUnavailable('runtime_request_cancelled')
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise WorkbenchUnavailable('runtime_request_timeout')
                    write_done.wait(min(.01, remaining))
                if written != [len(raw)]:
                    raise WorkbenchUnavailable('runtime_protocol_error')
            self.api.close(stdin)
            stdin = None
            while time.monotonic() < deadline:
                if cancel_event is not None and cancel_event.is_set():
                    raise WorkbenchUnavailable('runtime_request_cancelled')
                chunk = self.api.read_available(stdout)
                if chunk:
                    output.extend(chunk)
                    if len(output) > MAX_MESSAGE:
                        raise WorkbenchUnavailable("runtime_protocol_error")
                elif chunk == b"" and self.api.exit_code(process) != 259:
                    if self.api.exit_code(process) != 0:
                        raise WorkbenchUnavailable("runtime_protocol_error")
                    return json.loads(output.decode().splitlines()[-1])
                else:
                    if cancel_event is not None:
                        cancel_event.wait(min(.01, max(0, deadline - time.monotonic())))
                    else:
                        time.sleep(.01)
            raise WorkbenchUnavailable("runtime_request_timeout")
        finally:
            if self.api.exit_code(process) == 259:
                self.api.terminate_process(process)
            if writer is not None:
                writer.join(timeout=.2)
            for handle in (stdin, stdout, process):
                self.api.close(handle)
            if writer is not None and writer.is_alive():
                raise WorkbenchUnavailable('runtime_helper_cleanup_unverified')

    def _rpc(self, method, params, *, timeout=30, cancel_event=None, orchestration_request_id=None):
        if not self.ready:
            raise WorkbenchUnavailable()
        metadata, _, pipe, _ = self._read_identity()
        if self._owner_call:
            return self._owner_call(method, params)
        request = {"endpoint": pipe, "authToken": metadata["authToken"],
                   "expectedRuntimeId": metadata["runtimeId"], "method": method, "params": params}
        if orchestration_request_id is not None:
            if method != 'platform.taskProgress.send' or not isinstance(orchestration_request_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', orchestration_request_id):
                raise WorkbenchUnavailable('runtime_protocol_error')
            request.update(orchestrationContractVersion=1, orchestrationRequestId=orchestration_request_id)
        reply = self._capture([self._helper], request, timeout=timeout, cancel_event=cancel_event)
        if not reply.get("ok"):
            raise WorkbenchUnavailable("runtime_protocol_error")
        return reply["result"]

    def inspect_repo(self, environment_id, runtime_id, repo_id):
        """Read an existing native repo from this owned runtime, without creating an offer."""
        with self._lock:
            if not self.ready:
                raise WorkbenchUnavailable()
            metadata, _, _, _ = self._read_identity()
            try:
                installation = read_json(self.config.data_root / 'state/host-installation.json', 4096)['installationId']
                environment = str(uuid.uuid5(uuid.NAMESPACE_URL, 'control-everything:workbench:' + str(uuid.UUID(installation))))
            except (KeyError, ValueError, OSError, TypeError):
                raise WorkbenchUnavailable('runtime_identity_mismatch') from None
            if environment_id != environment or runtime_id != metadata['runtimeId']:
                raise WorkbenchUnavailable('runtime_identity_mismatch')
            reply = self._rpc('repo.list', {})
            repos = reply.get('repos') if isinstance(reply, dict) else None
            if not isinstance(repos, list) or any(not isinstance(row, dict) for row in repos):
                raise WorkbenchUnavailable('runtime_protocol_error')
            matches = [row for row in repos if row.get('id') == repo_id]
            if len(matches) != 1:
                raise WorkbenchUnavailable('project_directory_mismatch')
            repo = matches[0]
            hosts = (None, 'local', 'runtime:' + environment)
            if (repo.get('connectionId') is not None or repo.get('executionHostId') not in hosts
                    or not isinstance(repo.get('path'), str) or not isinstance(repo.get('displayName'), str)):
                raise WorkbenchUnavailable('project_directory_mismatch')
            directory = safe_path(repo['path'])
            if not directory.is_dir():
                raise WorkbenchUnavailable('project_directory_mismatch')
            same_directory = [row for row in repos if row.get('connectionId') is None
                              and row.get('executionHostId') in hosts and isinstance(row.get('path'), str)
                              and safe_path(row['path']) == directory]
            if len(same_directory) != 1 or self._read_identity()[0]['runtimeId'] != runtime_id:
                raise WorkbenchUnavailable('project_directory_mismatch')
            return {'repo_id': repo_id, 'directory': str(directory), 'name': repo['displayName'],
                    'environment_id': environment, 'runtime_id': runtime_id}

    def bootstrap(self, project_id, project_name, directory, *, remote=False):
        with self._lock:
            path = safe_path(directory)
            roots = tuple(safe_path(value) for value in self.config.allowed_workspace_roots)
            if not path.is_dir() or not any(path == root or path.is_relative_to(root) for root in roots):
                raise WorkbenchUnavailable("project_directory_not_allowed")
            repos = self._rpc("repo.list", {})["repos"]
            matches = [repo for repo in repos if repo.get("path") and Path(repo["path"]).resolve() == path]
            if len(matches) > 1:
                raise WorkbenchUnavailable("project_directory_mismatch")
            if matches:
                repo = matches[0]
            else:
                # Keep the registered directory as the project boundary, including non-Git folders.
                kind = "git" if (path / ".git").exists() else "folder"
                repo = self._rpc("repo.add", {"path": str(path), "displayName": str(project_name), "kind": kind})["repo"]
            if not repo.get("id") or safe_path(repo["path"]) != path:
                raise WorkbenchUnavailable("project_directory_mismatch")
            if matches and repo.get("displayName") != str(project_name):
                # The platform owns the project name; preserve the native repo and its sessions.
                repo = self._rpc("repo.update", {"repo": "id:" + repo["id"],
                                 "updates": {"displayName": str(project_name)}})["repo"]
            self._rpc("worktree.list", {"repo": "id:" + repo["id"]})
            result = self._bootstrap_runtime("Platform Web " + str(project_id), remote=remote)
            return {**result, "target": {"repoId": repo["id"]}}

    def bootstrap_runtime(self, *, remote=False):
        with self._lock:
            return self._bootstrap_runtime("Platform Web Workbench", remote=remote)

    def _bootstrap_runtime(self, name, *, remote):
        paired = self._rpc("platform.bootstrapDevice", {"name": name})
        if not paired.get("available"):
            raise WorkbenchUnavailable("pairing_unavailable")
        offer = paired.get("offer")
        try:
            if (not isinstance(offer, dict) or offer.get("v") != 2 or offer.get("scope") != "runtime"
                    or loopback_origin(offer.get("endpoint", ""), "ws") != self._ws_origin
                    or not offer.get("deviceToken") or not offer.get("pairedDeviceId")
                    or paired.get("deviceId") != offer["pairedDeviceId"]):
                raise WorkbenchUnavailable("runtime_protocol_error")
            installation = read_json(self.config.data_root / "state/host-installation.json", 4096)["installationId"]
            if offer.get("hostDescriptor", {}).get("installationId") != installation:
                raise WorkbenchUnavailable("runtime_identity_mismatch")
            environment = str(uuid.uuid5(uuid.NAMESPACE_URL, "control-everything:workbench:" + str(uuid.UUID(installation))))
        except (WorkbenchUnavailable, ValueError, KeyError, OSError):
            if paired.get("deviceId"):
                self._rpc("platform.revokeDevice", {"deviceId": paired["deviceId"]})
            raise
        result = {"runtime": {"environmentId": environment, "offer": offer}}
        if remote:
            # Journal before exposing the offer; an earlier crash cannot expose its token.
            try:
                self._write_remote_grants(self._read_remote_grants() | {offer["pairedDeviceId"]})
            except BaseException:
                self._rpc("platform.revokeDevice", {"deviceId": offer["pairedDeviceId"]})
                raise
        self._devices[offer["pairedDeviceId"]] = offer["deviceToken"]
        return result

    def _read_remote_grants(self):
        path = self.config.data_root / "platform-remote-grants.json"
        try:
            value = read_json(path)
        except FileNotFoundError:
            return set()
        ids = value.get("device_ids")
        if (value.get("schema") != 1 or not isinstance(ids, list) or len(ids) > 10000
                or any(not isinstance(item, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,255}", item) for item in ids)):
            raise WorkbenchUnavailable("runtime_remote_grants_invalid")
        return set(ids)

    def _write_remote_grants(self, devices):
        path = safe_path(self.config.data_root / "platform-remote-grants.json")
        temporary = safe_path(self.config.data_root / (".remote-grants-" + uuid.uuid4().hex))
        try:
            with temporary.open("x", encoding="utf-8") as stream:
                json.dump({"schema": 1, "device_ids": sorted(devices)}, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def revoke_remote_devices(self):
        """Retire only platform remote offers, including those exposed before a restart."""
        with self._lock:
            remaining = self._read_remote_grants()
            for device in tuple(remaining):
                self.revoke_device(device)
                remaining.remove(device)
                self._write_remote_grants(remaining)
            return {"revoked": True}

    def revoke_device(self, device_id):
        if not isinstance(device_id, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,255}", device_id):
            raise ValueError("invalid_device_id")
        with self._lock:
            result = self._rpc("platform.revokeDevice", {"deviceId": device_id})
            if not isinstance(result, dict) or type(result.get("revoked")) is not bool:
                raise WorkbenchUnavailable("runtime_protocol_error")
            self._devices.pop(device_id, None)
            return result["revoked"]

    def discard_bootstrap(self, result):
        with self._lock:
            offer = result.get("runtime", {}).get("offer", {})
            device = offer.get("pairedDeviceId")
            token = self._devices.get(device)
            if token and secrets.compare_digest(token, offer.get("deviceToken", "")):
                self._rpc("platform.revokeDevice", {"deviceId": device})
                del self._devices[device]
                remote = self._read_remote_grants()
                if device in remote:
                    self._write_remote_grants(remote - {device})

    def stop(self, *, retire_idle_daemon=False):
        with self._lock:
            if not self.ready:
                raise WorkbenchUnavailable()
            metadata, instance, _, _ = self._read_identity()
            request = {"schemaVersion": 1, "transactionId": str(uuid.uuid4()), "version": instance["version"],
                       "runtimeId": metadata["runtimeId"], "instance": {"pid": self._pid, "startedAtMs": self._created,
                       "nonce": instance["nonce"], "lockPath": str(self.config.data_root / "state/orcad.lock")}}
            if retire_idle_daemon:
                request["retireIdleDaemon"] = True
            path = self.config.data_root / ("managed-stop-" + request["transactionId"] + ".json")
            with path.open("x", encoding="utf-8") as stream:
                json.dump(request, stream)
            result = self._capture([self._entry, "--complete-managed-stop", "--request-file", path], timeout=40)
            if (result.get("verdict") != "exited" or result.get("receiptPersisted") is not True
                    or result.get("runtimeId") != metadata["runtimeId"] or result.get("instance") != request["instance"]
                    or self.api.exit_code(self._process) == 259):
                raise WorkbenchUnavailable("runtime_stop_unverified")
            self._release_process()
            if retire_idle_daemon and result.get("retirement") != "retired":
                raise WorkbenchUnavailable("runtime_daemon_busy")
            return result

    def _release_process(self):
        self._reader_stop.set()
        if self._reader:
            self._reader.join(timeout=1)
        for handle in (self._stdin, self._stdout, self._process):
            self.api.close(handle)
        self._stdin = self._stdout = self._process = self._metadata = self._instance = None
        self._reader = None

    def _close_job(self, *, force=False):
        if self._job:
            if force:
                self.api.terminate_job(self._job)
            deadline = time.monotonic() + 5
            while self.api.active(self._job) and time.monotonic() < deadline:
                time.sleep(.02)
            if self.api.active(self._job):
                raise WorkbenchUnavailable("runtime_cleanup_unverified")
            self.api.close(self._job)
            self._job = None
        self.api.close(self._owner)
        self._owner = None
        self.cleanup_verified = True

    def close(self, *, force=False):
        with self._lock:
            if self._process and not force:
                self.stop(retire_idle_daemon=True)
            if force and self._job:
                self.api.terminate_job(self._job)
                self._release_process()
            if self.api:
                self._close_job()
            return self.cleanup_verified
