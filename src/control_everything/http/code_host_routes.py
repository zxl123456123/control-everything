"""Read-only, local-only status of the code-host CLIs (gh for GitHub, glab for GitLab).

The Studio only uses this to say "connected as @name / not connected / not installed" and which provider a
project's remote points at. It never starts a login, never returns a token, a remote URL, or a CLI path, and
makes no change to the CLI's configuration. Host/Origin checks stay in the gateway; this module refuses
tunnelled requests and does the probing. Orca's own Settings > Integrations card remains the place to
connect: the Studio only links to it.
"""
import json
import os
import re
import shutil
import subprocess
import threading
import time
from urllib.parse import parse_qs, urlsplit

from control_everything.input_validation import ProfileError
from control_everything.workspace.store import WorkspaceError
from control_everything.workspace.validation import project_id_valid

GET_ROUTES = {"/api/workspace/code-host"}
DIRECTORY_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
CLI_TIMEOUT = 8
GIT_TIMEOUT = 4
CACHE_SECONDS = 20
LOGIN = re.compile(r"\A[A-Za-z0-9][A-Za-z0-9._-]{0,99}\Z")
# "Logged in to github.com account octocat (keyring)"  /  "Logged in to gitlab.com as octocat (config)"
TEXT_LOGIN = re.compile(r"Logged in to (\S+) (?:account|as) ([A-Za-z0-9][A-Za-z0-9._-]{0,99})")
SCP_REMOTE = re.compile(r"\A(?:[^@/\s]+@)?([^:/\s]+):(?!//)")


def provider_for_host(host):
    host = (host or "").lower().rstrip(".")
    if host == "github.com" or host.endswith(".github.com"):
        return "github"
    if host == "gitlab.com" or host.startswith("gitlab.") or host.endswith(".gitlab.com"):
        return "gitlab"
    return None


def remote_host(url):
    """Only the host name of a git remote is ever read; credentials embedded in the URL are dropped."""
    text = (url or "").strip()
    if "://" in text:
        try:
            return urlsplit(text).hostname
        except ValueError:
            return None
    match = SCP_REMOTE.match(text)
    return match[1] if match else None


def provider_from_remotes(lines):
    """`git config --get-regexp ^remote\\..*\\.url$` lines; origin wins, otherwise the first known host."""
    found = []
    for index, line in enumerate(lines):
        key, _, value = line.partition(" ")
        name = key[len("remote."):-len(".url")] if key.startswith("remote.") and key.endswith(".url") else ""
        provider = provider_for_host(remote_host(value))
        if provider:
            found.append((name != "origin", index, provider))
    return min(found)[2] if found else None


def _login(value):
    return value if isinstance(value, str) and LOGIN.fullmatch(value) else None


def parse_gh_json(text, host="github.com"):
    try:
        entries = json.loads(text).get("hosts", {}).get(host, [])
    except (ValueError, AttributeError):
        return None
    if not isinstance(entries, list):
        return None
    ok = [entry for entry in entries if isinstance(entry, dict) and entry.get("state") == "success"]
    chosen = next((entry for entry in ok if entry.get("active")), ok[0] if ok else None)
    return {"authenticated": bool(chosen), "user": _login(chosen.get("login")) if chosen else None}


def parse_auth_text(text, host):
    for found_host, user in TEXT_LOGIN.findall(text or ""):
        if found_host.lower() == host:
            return {"authenticated": True, "user": _login(user)}
    return {"authenticated": False, "user": None}


class CodeHostProbe:
    """Runs the CLIs with a short timeout and remembers each answer for a few seconds."""

    def __init__(self, runner=subprocess.run, which=shutil.which, clock=time.monotonic):
        self.runner, self.which, self.clock = runner, which, clock
        self.lock = threading.Lock()
        self.cache = {}

    def _run(self, argv, cwd=None, timeout=CLI_TIMEOUT):
        env = {"GH_PROMPT_DISABLED": "1", "NO_COLOR": "1", "GH_NO_UPDATE_NOTIFIER": "1", "GIT_TERMINAL_PROMPT": "0",
               "GLAB_SEND_TELEMETRY": "0", "NO_PROMPT": "1"}
        env = {**os.environ, **env}
        return self.runner(argv, capture_output=True, text=True, timeout=timeout, cwd=cwd, env=env, shell=False,
                           stdin=subprocess.DEVNULL, encoding="utf-8", errors="replace")

    def _tool(self, name, host):
        executable = self.which(name)
        if not executable:
            return {"installed": False, "authenticated": False, "user": None, "host": host}
        try:
            if name == "gh":
                result = self._run([executable, "auth", "status", "--hostname", host, "--json", "hosts"])
                value = parse_gh_json(result.stdout, host) if result.returncode == 0 else None
                if value is None:
                    # Older gh has no --json; its plain output is read for the account name only.
                    result = self._run([executable, "auth", "status", "--hostname", host])
                    value = parse_auth_text((result.stdout or "") + "\n" + (result.stderr or ""), host) if result.returncode == 0 else \
                        {"authenticated": False, "user": None}
            else:
                result = self._run([executable, "auth", "status", "--hostname", host])
                value = parse_auth_text((result.stdout or "") + "\n" + (result.stderr or ""), host) if result.returncode == 0 else \
                    {"authenticated": False, "user": None}
        except (OSError, subprocess.SubprocessError):
            return {"installed": True, "authenticated": False, "user": None, "host": host, "unavailable": True}
        return {"installed": True, **value, "host": host}

    def tool(self, provider, refresh=False):
        name, host = ("gh", "github.com") if provider == "github" else ("glab", "gitlab.com")
        with self.lock:
            hit = self.cache.get(provider)
            if hit and not refresh and self.clock() - hit[0] < CACHE_SECONDS:
                return hit[1]
        value = self._tool(name, host)
        with self.lock:
            self.cache[provider] = (self.clock(), value)
        return value

    def project_provider(self, directory):
        executable = self.which("git")
        if not executable or not directory:
            return None
        try:
            result = self._run([executable, "config", "--get-regexp", r"^remote\..*\.url$"], cwd=directory, timeout=GIT_TIMEOUT)
        except (OSError, subprocess.SubprocessError):
            return None
        return provider_from_remotes(result.stdout.splitlines()) if result.returncode == 0 else None


DEFAULT_PROBE = CodeHostProbe()


def handle_get(handler, path):
    from control_everything.http import remote_context
    # Another person's tunnel must not learn which account the owner's CLI is signed in to.
    if remote_context.remote_request(handler) or handler.headers.get_all("X-CE-Proxy-Token", []):
        raise ProfileError("local_only", status=403)
    query = parse_qs(path.query, keep_blank_values=True, strict_parsing=True) if path.query else {}
    if set(query) - {"project_id", "directory_id", "refresh"} or any(len(value) != 1 for value in query.values()):
        raise ProfileError("invalid_query")
    project_id = query.get("project_id", [None])[0]
    directory_id = query.get("directory_id", [None])[0]
    refresh = query.get("refresh", ["0"])[0]
    if (project_id is not None and not project_id_valid(project_id)) or refresh not in {"0", "1"} or \
            (directory_id is not None and (project_id is None or not DIRECTORY_ID.fullmatch(directory_id))):
        raise ProfileError("invalid_query")
    probe = getattr(handler.server, "code_host_probe", None) or DEFAULT_PROBE
    body = {"project": None, "tools": {}}
    provider = None
    if project_id is not None:
        try:
            directory = handler.server.workspace.project_directory(project_id, directory_id)
        except WorkspaceError:
            raise ProfileError("project_not_found", status=404) from None
        provider = probe.project_provider(directory)
        body["project"] = {"provider": provider}
    body["tools"]["github"] = probe.tool("github", refresh == "1")
    if provider == "gitlab":
        body["tools"]["gitlab"] = probe.tool("gitlab", refresh == "1")
    handler.reply(200, body)
