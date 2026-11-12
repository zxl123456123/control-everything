"""GitHub progress collection contracts; no credentials or network calls."""
import copy
import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from control_everything.integrations import github_progress as progress


def connection(nodes, *, more=False, cursor=None):
    return {"nodes": nodes, "totalCount": len(nodes),
            "pageInfo": {"hasNextPage": more, "endCursor": cursor}}


def issue(number=1, **changes):
    item = {"number": number, "title": "A tracked task", "body": "", "state": "OPEN",
            "url": f"https://github.com/example/project/issues/{number}",
            "stateReason": None, "author": {"login": "requester"},
            "assignees": connection([{"login": "worker"}]),
            "updatedAt": "2026-11-12T01:00:00Z", "closedAt": None}
    return {**item, **changes}


def pull(number=2, **changes):
    item = {"number": number, "title": "A change", "state": "OPEN",
            "url": f"https://github.com/example/project/pull/{number}",
            "author": {"login": "author"}, "isDraft": False,
            "reviewRequests": connection([{"requestedReviewer": {"__typename": "User", "login": "reviewer"}}]),
            "reviewDecision": "REVIEW_REQUIRED", "statusCheckRollup": {"state": "SUCCESS"},
            "updatedAt": "2026-11-12T01:00:00Z", "closedAt": None, "mergedAt": None}
    return {**item, **changes}


def project_item(number=1, kind="Issue", repository="example/project", fields=None, **changes):
    item = {"id": f"project-{kind}-{number}", "isArchived": False,
            "content": {"__typename": kind, "number": number,
                        "repository": {"nameWithOwner": repository}},
            "fieldValues": connection(fields or [])}
    return {**item, **changes}


class FakeGraphQL:
    def __init__(self, issues=None, pulls=None, items=None):
        self.pages = {"issues": [connection(issues or [])], "pullRequests": [connection(pulls or [])],
                      "items": [connection(items or [])]}
        self.calls = []

    def __call__(self, text, variables):
        name = "items" if "ProgressProject" in text else "pullRequests" if "ProgressPullRequests" in text else "issues"
        self.calls.append((name, copy.deepcopy(variables)))
        page = copy.deepcopy(self.pages[name].pop(0))
        if name == "items":
            return {"user": {"projectV2": {"items": page}}}
        return {"repository": {name: page}}


class CollectionTests(unittest.TestCase):
    def collect(self, source):
        return progress.collect("fixture-token", "example/project", "example", 1, query=source)

    def test_closed_issue_reason_and_pr_merge_remain_distinct(self):
        result = self.collect(FakeGraphQL(
            [issue(state="CLOSED", stateReason="NOT_PLANNED", closedAt="2026-11-12T02:00:00Z")],
            [pull(state="CLOSED", closedAt="2026-11-12T02:00:00Z"),
             pull(3, state="MERGED", mergedAt="2026-11-12T02:00:00Z", closedAt="2026-11-12T02:00:00Z")]))
        self.assertEqual(result[0]["state_reason"], "NOT_PLANNED")
        self.assertEqual((result[1]["state"], result[1]["merged_at"]), ("CLOSED", None))
        self.assertEqual(result[2]["state"], "MERGED")
        self.assertEqual(result[1]["owners"], ["author"])
        self.assertEqual(result[1]["reviewers"], ["reviewer"])
        self.assertEqual(result[1]["checks"], "SUCCESS")

    def test_team_reviewers_remain_explicit_without_requesting_organization_scope(self):
        result = self.collect(FakeGraphQL([], [pull(reviewRequests=connection([
            {"requestedReviewer": {"__typename": "User", "login": "reviewer"}},
            {"requestedReviewer": {"__typename": "Team"}},
        ]))]))
        self.assertEqual(result[0]["reviewers"], ["reviewer", "团队（名称受权限限制）"])
        self.assertTrue(result[0]["reviewers_limited"])
        self.assertNotIn("... on Team", progress.PR_QUERY)
        self.assertNotIn("slug", progress.PR_QUERY)

    def test_user_reviewer_names_are_not_marked_as_limited(self):
        result = self.collect(FakeGraphQL([], [pull()]))
        self.assertFalse(result[0]["reviewers_limited"])

    def test_project_fields_and_issue_owner_precedence(self):
        fields = [
            {"__typename": "ProjectV2ItemFieldSingleSelectValue", "field": {"name": "Status"}, "name": "开发中"},
            {"__typename": "ProjectV2ItemFieldSingleSelectValue", "field": {"name": "优先级"}, "name": "优先处理"},
            {"__typename": "ProjectV2ItemFieldTextValue", "field": {"name": "下一步"}, "text": "Review the change"},
            {"__typename": "ProjectV2ItemFieldUserValue", "field": {"name": "Assignees"},
             "users": connection([{"login": "project-owner"}])},
        ]
        result = self.collect(FakeGraphQL([issue()], [pull()],
                            [project_item(fields=fields), project_item(2, "PullRequest", fields=fields)]))
        self.assertEqual(result[0]["owners"], ["project-owner"])
        self.assertEqual(result[0]["owner_source"], "project")
        self.assertEqual(result[0]["status"], "开发中")
        self.assertEqual(result[0]["next_step"], "Review the change")
        self.assertEqual(result[0]["priority"], "优先处理")
        self.assertEqual(result[1]["owners"], ["author"])

    def test_missing_project_membership_and_archived_items_remain_explicit(self):
        result = self.collect(FakeGraphQL([issue(), issue(5)], [], [project_item(isArchived=True)]))
        self.assertTrue(result[0]["archived"])
        self.assertEqual(result[1]["status"], "")
        self.assertFalse(result[1]["archived"])

    def test_only_explicit_body_owner_is_a_fallback(self):
        empty = connection([])
        result = self.collect(FakeGraphQL([
            issue(body="负责人：`alice`\nDetails", assignees=empty),
            issue(2, body="Please ask `bob` for details", assignees=empty),
            issue(3, body="负责人：`alice`\nDetails")]))
        self.assertEqual((result[0]["owners"], result[0]["owner_source"]), (["alice"], "body"))
        self.assertEqual(result[1]["owners"], [])
        self.assertEqual(result[2]["owners"], ["worker"])

    def test_personal_project_filters_foreign_items_and_drafts(self):
        source = FakeGraphQL([issue()], [], [project_item(repository="other/project"),
                              {"id": "draft", "isArchived": False,
                               "content": {"__typename": "DraftIssue"}, "fieldValues": connection([])}])
        result = self.collect(source)
        self.assertEqual(result[0]["status"], "")
        self.assertEqual(len(result), 1)
        self.assertIn("user(login:", progress.PROJECT_QUERY)

    def test_all_three_top_level_connections_follow_independent_cursors(self):
        source = FakeGraphQL()
        for name, nodes in (("issues", [issue(), issue(4)]), ("pullRequests", [pull(), pull(3)]),
                            ("items", [project_item(), project_item(4)])):
            source.pages[name] = [connection([nodes[0]], more=True, cursor=name + "-next"), connection([nodes[1]])]
        self.assertEqual(len(self.collect(source)), 4)
        for name in ("issues", "pullRequests", "items"):
            calls = [variables for called, variables in source.calls if called == name]
            self.assertEqual([call["cursor"] for call in calls], [None, name + "-next"])

    def test_null_missing_and_partial_graphql_results_are_rejected(self):
        for broken in (None, {}, {"repository": None}, {"errors": [{"message": "private"}], "repository": {}},
                       {"repository": {"issues": connection([None])}}):
            with self.subTest(broken=broken), self.assertRaises(ValueError):
                self.collect(lambda *args: broken)
        for key in ("title", "updatedAt", "state", "assignees"):
            record = issue()
            del record[key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                self.collect(FakeGraphQL([record]))

    def test_bad_and_repeated_pagination_cursors_are_rejected(self):
        for cursor in (None, ""):
            source = FakeGraphQL([issue()])
            source.pages["issues"][0]["pageInfo"] = {"hasNextPage": True, "endCursor": cursor}
            with self.assertRaises(ValueError):
                self.collect(source)
        source = FakeGraphQL()
        source.pages["issues"] = [connection([issue()], more=True, cursor="same"),
                                  connection([issue(4)], more=True, cursor="same")]
        with self.assertRaises(ValueError):
            self.collect(source)

    def test_nested_truncation_cannot_be_silently_reported_as_complete(self):
        source = FakeGraphQL([issue(assignees=connection([{"login": "worker"}], more=True, cursor="more"))])
        with self.assertRaises(ValueError):
            self.collect(source)
        source = FakeGraphQL([], [pull(reviewRequests=connection([], more=True, cursor="more"))])
        with self.assertRaises(ValueError):
            self.collect(source)

    def test_duplicate_repository_identity_is_rejected(self):
        with self.assertRaises(ValueError):
            self.collect(FakeGraphQL([issue(), issue()]))

    def test_http_transport_is_fixed_and_sanitizes_api_errors(self):
        response = io.BytesIO(json.dumps({"errors": [{"message": "private detail"}]}).encode())
        opener = unittest.mock.Mock()
        opener.open.return_value = response
        with patch.object(progress, "build_opener", return_value=opener), self.assertRaisesRegex(ValueError, "github_graphql_failed"):
            progress.collect("fixture-token", "example/project", "example", 1)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.github.com/graphql")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 30)

    def test_http_failures_and_malformed_data_never_expose_private_details(self):
        for failure in (HTTPError("https://api.github.com/graphql", 401, "private", {}, None),
                        URLError("private fixture-token")):
            opener = unittest.mock.Mock()
            opener.open.side_effect = failure
            with patch.object(progress, "build_opener", return_value=opener), self.assertRaises(ValueError) as caught:
                progress.collect("fixture-token", "example/project", "example", 1)
            self.assertEqual(str(caught.exception), "github_request_failed")
        for payload in ("not json", "[]", '{"data":null}'):
            opener = unittest.mock.Mock()
            opener.open.return_value = io.BytesIO(payload.encode())
            with patch.object(progress, "build_opener", return_value=opener), self.assertRaises(ValueError):
                progress.collect("fixture-token", "example/project", "example", 1)

    def test_transport_refuses_redirects(self):
        with self.assertRaisesRegex(ValueError, "github_redirect_refused"):
            progress.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://other.example/")

    def test_pagination_limit_does_not_return_a_partial_snapshot(self):
        count = 0

        def endless(text, variables):
            nonlocal count
            count += 1
            return {"repository": {"issues": connection([issue(count)], more=True, cursor=str(count))}}

        with self.assertRaisesRegex(ValueError, "github_pagination_limit"):
            self.collect(endless)
        self.assertEqual(count, 100)

    def test_unavailable_project_and_nested_field_truncation_are_rejected(self):
        source = FakeGraphQL([issue()])
        original = source.__call__

        def missing(text, variables):
            if "ProgressProject" in text:
                return {"user": {"projectV2": None}}
            return original(text, variables)

        with self.assertRaises(ValueError):
            self.collect(missing)
        card = project_item()
        card["fieldValues"] = connection([], more=True, cursor="next")
        with self.assertRaises(ValueError):
            self.collect(FakeGraphQL([issue()], [], [card]))


if __name__ == "__main__":
    unittest.main()
