"""Code-host status route: local-only, read-only, token-free, with the CLIs replaced by fakes."""

import json
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from control_everything.http import code_host_routes as routes
from control_everything.http import remote_context
from tests.backend import test_profile_http as http_fixtures
from tests.backend.test_project_management import project_body

GH_JSON = {"hosts": {"github.com": [
    {"state": "success", "active": False, "host": "github.com", "login": "second", "tokenSource": "keyring"},
    {"state": "success", "active": True, "host": "github.com", "login": "octocat", "tokenSource": "keyring"}]}}
SECRET = "ghp_NOT_A_REAL_TOKEN_0123456789"


def fake_runner(gh=None, glab=None, remotes="", calls=None):
    """Answers like the real CLIs; `gh`/`glab` are (returncode, stdout, stderr) or None for an unauthenticated CLI."""
    def run(argv, **options):
        if calls is not None:
            calls.append((list(argv), options))
        name = argv[0].rsplit("/", 1)[-1]
        if name == "git":
            return SimpleNamespace(returncode=0 if remotes else 1, stdout=remotes, stderr="")
        reply = {"gh": gh, "glab": glab}[name]
        if reply is None:
            return SimpleNamespace(returncode=1, stdout="", stderr="You are not logged into any GitHub hosts.")
        if name == "gh" and "--json" in argv and len(reply) == 4:
            return SimpleNamespace(returncode=reply[3], stdout="", stderr="unknown flag: --json")
        return SimpleNamespace(returncode=reply[0], stdout=reply[1], stderr=reply[2])
    return run


def probe(installed=("gh", "git", "glab"), **kwargs):
    return routes.CodeHostProbe(runner=fake_runner(**kwargs), which=lambda name: f"/usr/bin/{name}" if name in installed else None,
                                clock=kwargs.get("clock") or (lambda: 0.0))


class ParsingTests(unittest.TestCase):
    def test_provider_is_read_from_host_only(self):
        cases = {"https://github.com/o/r.git": "github", "https://user:pw@github.com/o/r": "github", "git@github.com:o/r.git": "github",
                 "ssh://git@github.com/o/r": "github", "https://gitlab.com/o/r": "gitlab", "git@gitlab.example.com:o/r": "gitlab",
                 "https://example.com/github.com/o": None, "https://github.com.evil.example/o/r": None, "": None, "/local/path": None}
        for url, expected in cases.items():
            self.assertEqual(routes.provider_for_host(routes.remote_host(url)), expected, url)

    def test_origin_wins_over_other_remotes(self):
        lines = ["remote.fork.url https://gitlab.com/a/b", "remote.origin.url https://github.com/a/b"]
        self.assertEqual(routes.provider_from_remotes(lines), "github")
        self.assertEqual(routes.provider_from_remotes(["remote.up.url https://gitlab.com/a/b", "remote.z.url https://github.com/a/b"]), "gitlab")
        self.assertIsNone(routes.provider_from_remotes(["remote.origin.url https://example.com/a/b"]))

    def test_gh_json_prefers_the_active_account_and_never_exposes_the_token(self):
        self.assertEqual(routes.parse_gh_json(json.dumps(GH_JSON)), {"authenticated": True, "user": "octocat"})
        failed = {"hosts": {"github.com": [{"state": "error", "active": True, "login": "octocat"}]}}
        self.assertEqual(routes.parse_gh_json(json.dumps(failed)), {"authenticated": False, "user": None})
        self.assertEqual(routes.parse_gh_json(json.dumps({"hosts": {"github.com": [{"state": "success", "active": True, "login": "bad name<script>"}]}})),
                         {"authenticated": True, "user": None})
        self.assertIsNone(routes.parse_gh_json("not json"))

    def test_older_text_output(self):
        text = "github.com\n  ✓ Logged in to github.com account octocat (keyring)\n  - Token: gho_****\n"
        self.assertEqual(routes.parse_auth_text(text, "github.com"), {"authenticated": True, "user": "octocat"})
        self.assertEqual(routes.parse_auth_text("✓ Logged in to gitlab.com as tanuki (config)", "gitlab.com")["user"], "tanuki")
        self.assertFalse(routes.parse_auth_text("Logged in to other.example as x", "github.com")["authenticated"])


class ProbeTests(unittest.TestCase):
    def test_three_states(self):
        connected = probe(gh=(0, json.dumps(GH_JSON), "")).tool("github")
        self.assertEqual((connected["installed"], connected["authenticated"], connected["user"]), (True, True, "octocat"))
        signed_out = probe(gh=None).tool("github")
        self.assertEqual((signed_out["installed"], signed_out["authenticated"], signed_out["user"]), (True, False, None))
        missing = probe(installed=("git",), gh=None).tool("github")
        self.assertEqual((missing["installed"], missing["authenticated"]), (False, False))

    def test_old_gh_falls_back_to_text_and_commands_are_read_only(self):
        calls = []
        text = "github.com\n  ✓ Logged in to github.com account octocat (keyring)\n"
        value = probe(gh=(0, text, "", 1), calls=calls).tool("github")
        self.assertEqual(value["user"], "octocat")
        for argv, options in calls:
            self.assertEqual(argv[1:3], ["auth", "status"])
            self.assertFalse(options.get("shell"))
            self.assertEqual(options["stdin"], subprocess.DEVNULL)
            self.assertEqual(options["env"]["GH_PROMPT_DISABLED"], "1")

    def test_result_is_cached_until_refreshed(self):
        now, calls = [0.0], []
        tool = routes.CodeHostProbe(runner=fake_runner(gh=(0, json.dumps(GH_JSON), ""), calls=calls), which=lambda name: "/bin/" + name,
                                    clock=lambda: now[0])
        tool.tool("github"); tool.tool("github")
        self.assertEqual(len(calls), 1)
        tool.tool("github", refresh=True)
        self.assertEqual(len(calls), 2)
        now[0] = 60
        tool.tool("github")
        self.assertEqual(len(calls), 3)

    def test_timeout_and_missing_binary_do_not_raise(self):
        def slow(argv, **options):
            raise subprocess.TimeoutExpired(argv, 8)
        value = routes.CodeHostProbe(runner=slow, which=lambda name: "/bin/" + name).tool("github")
        self.assertEqual((value["installed"], value["authenticated"], value["user"]), (True, False, None))


class CodeHostRouteTests(unittest.TestCase):
    request = http_fixtures.ProfileHTTPTests.request

    def setUp(self):
        http_fixtures.ProfileHTTPTests.setUp(self)
        self.directory = self.root / "repo"
        self.directory.mkdir()
        self.project = self.request("/api/workspace/projects/save", "POST", project_body(self.directory))[1]["project"]["id"]
        self.route = "/api/workspace/code-host?project_id=" + self.project
        self.server.code_host_probe = probe(gh=(0, json.dumps(GH_JSON), SECRET), remotes="remote.origin.url git@github.com:o/r.git\n")

    def test_github_project_reports_user_and_nothing_else(self):
        status, value = self.request(self.route)
        self.assertEqual(status, 200)
        self.assertEqual(value["project"], {"provider": "github"})
        self.assertEqual(value["tools"], {"github": {"installed": True, "authenticated": True, "user": "octocat", "host": "github.com"}})
        self.assertNotIn(SECRET, json.dumps(value))
        self.assertNotIn("git@github.com", json.dumps(value))
        self.assertNotIn(str(self.directory), json.dumps(value))

    def test_non_github_and_remoteless_projects_report_no_provider(self):
        self.server.code_host_probe = probe(gh=None, remotes="remote.origin.url https://example.com/o/r\n")
        self.assertEqual(self.request(self.route)[1]["project"], {"provider": None})
        self.server.code_host_probe = probe(gh=None, remotes="")
        self.assertEqual(self.request(self.route)[1]["project"], {"provider": None})

    def test_gitlab_project_also_reports_glab(self):
        self.server.code_host_probe = probe(gh=None, glab=(0, "Logged in to gitlab.com as tanuki (config)", ""),
                                            remotes="remote.origin.url https://gitlab.com/o/r\n")
        value = self.request(self.route)[1]
        self.assertEqual(value["project"]["provider"], "gitlab")
        self.assertEqual(value["tools"]["gitlab"]["user"], "tanuki")

    def test_without_a_project_only_the_github_tool_is_reported(self):
        value = self.request("/api/workspace/code-host")[1]
        self.assertEqual((value["project"], list(value["tools"])), (None, ["github"]))

    def test_unknown_project_and_bad_queries(self):
        self.assertEqual(self.request("/api/workspace/code-host?project_id=missing-project")[0], 404)
        for query in ("project_id=../x", "project_id=A", "other=1", "project_id=a&project_id=b", "refresh=2", "directory_id=main",
                      "project_id=" + self.project + "&directory_id=../x"):
            self.assertEqual(self.request("/api/workspace/code-host?" + query)[0], 422, query)
        self.assertEqual(self.request(self.route + "&refresh=1")[0], 200)

    def test_tunnelled_requests_are_refused_and_run_nothing(self):
        self.server.code_host_probe = Mock()
        self.assertEqual(self.request(self.route, headers={"X-CE-Proxy-Token": "x"})[0], 403)
        self.assertEqual(self.request(self.route, headers={remote_context.PROXY_HEADER: "x"})[0], 403)
        self.server.code_host_probe.tool.assert_not_called()
        self.server.code_host_probe.project_provider.assert_not_called()

    def test_host_and_client_header_checks_still_apply_and_the_route_is_get_only(self):
        self.assertEqual(self.request(self.route, headers={"Host": "bad"})[1]["reason"], "host_rejected")
        self.assertEqual(self.request(self.route, headers={"X-Session-Client": ""})[1]["reason"], "client_header_required")
        self.assertNotEqual(self.request("/api/workspace/code-host", "POST", {})[0], 200)


if __name__ == "__main__":
    unittest.main()
