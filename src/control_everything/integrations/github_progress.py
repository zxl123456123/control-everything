"""Read complete repository and personal Project snapshots without changing GitHub."""
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


ISSUE_QUERY = """query ProgressIssues($owner:String!,$name:String!,$cursor:String) {
  repository(owner:$owner,name:$name) {
    issues(first:100,after:$cursor,states:[OPEN,CLOSED]) {
      pageInfo { hasNextPage endCursor }
      nodes { number title body url state stateReason author { login } updatedAt closedAt
        assignees(first:100) { totalCount pageInfo { hasNextPage endCursor } nodes { login } }
      }
    }
  }
}"""
PR_QUERY = """query ProgressPullRequests($owner:String!,$name:String!,$cursor:String) {
  repository(owner:$owner,name:$name) {
    pullRequests(first:100,after:$cursor,states:[OPEN,CLOSED,MERGED]) {
      pageInfo { hasNextPage endCursor }
      nodes { number title url state author { login } isDraft updatedAt closedAt mergedAt
        reviewDecision statusCheckRollup { state }
        reviewRequests(first:100) { totalCount pageInfo { hasNextPage endCursor }
          nodes { requestedReviewer { __typename ... on User { login } } }
        }
      }
    }
  }
}"""
PROJECT_QUERY = """query ProgressProject($login:String!,$number:Int!,$cursor:String) {
  user(login:$login) { projectV2(number:$number) {
    items(first:50,after:$cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id isArchived content { __typename
          ... on Issue { number repository { nameWithOwner } }
          ... on PullRequest { number repository { nameWithOwner } }
        }
        fieldValues(first:50) { pageInfo { hasNextPage endCursor } nodes { __typename
          ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
          ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }
          ... on ProjectV2ItemFieldUserValue { field { ... on ProjectV2FieldCommon { name } }
            users(first:100) { totalCount pageInfo { hasNextPage endCursor } nodes { login } }
          }
        } }
      }
    }
  } }
}"""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise ValueError("github_redirect_refused")


def _request(token, text, variables):
    request = Request("https://api.github.com/graphql",
                      data=json.dumps({"query": text, "variables": variables}).encode("utf-8"),
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                               "User-Agent": "control-everything-progress"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            payload = json.load(response)
    except (HTTPError, URLError, OSError):
        raise ValueError("github_request_failed") from None
    except (ValueError, UnicodeError):
        raise ValueError("github_response_invalid") from None
    if not isinstance(payload, dict) or payload.get("errors"):
        raise ValueError("github_graphql_failed")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise ValueError("github_response_invalid")
    return data


def _page(connection):
    nodes, info = connection["nodes"], connection["pageInfo"]
    if (not isinstance(nodes, list) or any(not isinstance(node, dict) for node in nodes)
            or type(info["hasNextPage"]) is not bool):
        raise ValueError("github_response_invalid")
    cursor = info["endCursor"]
    if info["hasNextPage"] and (not isinstance(cursor, str) or not cursor):
        raise ValueError("github_cursor_missing")
    return nodes, info["hasNextPage"], cursor


def _nested(connection):
    nodes, more, _ = _page(connection)
    if more or ("totalCount" in connection and connection["totalCount"] != len(nodes)):
        raise ValueError("github_nested_connection_incomplete")
    return nodes


def _pages(load):
    cursor, seen, result = None, set(), []
    for _ in range(100):
        nodes, more, next_cursor = _page(load(cursor))
        result.extend(nodes)
        if not more:
            return result
        if next_cursor in seen:
            raise ValueError("github_cursor_repeated")
        seen.add(next_cursor)
        cursor = next_cursor
    raise ValueError("github_pagination_limit")


def _normalize(node, kind, repository):
    number = node["number"]
    if type(number) is not int or number < 1 or node["state"] not in ("OPEN", "CLOSED", "MERGED"):
        raise ValueError("github_item_invalid")
    suffix = "issues" if kind == "issue" else "pull"
    if node["url"] != f"https://github.com/{repository}/{suffix}/{number}":
        raise ValueError("github_item_repository_mismatch")
    if not isinstance(node["title"], str) or not isinstance(node["updatedAt"], str) or not node["updatedAt"]:
        raise ValueError("github_item_invalid")
    author = node["author"]["login"] if node["author"] is not None else ""
    result = {"id": f"{kind}:{number}", "kind": kind, "number": number, "title": node["title"],
              "url": node["url"], "state": node["state"], "state_reason": None, "author": author,
              "owners": [], "owner_source": "unassigned", "reviewers": [], "reviewers_limited": False,
              "review_decision": None,
              "checks": None, "is_draft": False, "status": "", "priority": "", "next_step": "",
              "updated_at": node["updatedAt"], "closed_at": node["closedAt"], "merged_at": None,
              "archived": False}
    if kind == "issue":
        result["state_reason"] = node["stateReason"]
        result["owners"] = [user["login"] for user in _nested(node["assignees"])]
        result["owner_source"] = "assignees" if result["owners"] else "unassigned"
        if not result["owners"]:
            owner = re.match(r"\A\s*负责人[：:]\s*`([A-Za-z0-9-]{1,39})`[ \t]*(?:\r?\n|$)", node["body"])
            if owner:
                result.update(owners=[owner[1]], owner_source="body")
    else:
        result.update(owners=[author] if author else [], owner_source="author" if author else "unassigned",
                      merged_at=node["mergedAt"], is_draft=node["isDraft"], review_decision=node["reviewDecision"],
                      checks=node["statusCheckRollup"]["state"] if node["statusCheckRollup"] is not None else None)
        for request in _nested(node["reviewRequests"]):
            reviewer = request["requestedReviewer"]
            if reviewer["__typename"] == "User":
                result["reviewers"].append(reviewer["login"])
            elif reviewer["__typename"] == "Team":
                result["reviewers"].append("团队（名称受权限限制）")
                result["reviewers_limited"] = True
            else:
                raise ValueError("github_reviewer_unknown")
    return result


def _project_fields(card):
    result = {}
    for value in _nested(card["fieldValues"]):
        kind = value["__typename"]
        if kind == "ProjectV2ItemFieldSingleSelectValue":
            result[value["field"]["name"]] = value["name"] or ""
        elif kind == "ProjectV2ItemFieldTextValue":
            result[value["field"]["name"]] = value["text"] or ""
        elif kind == "ProjectV2ItemFieldUserValue":
            result[value["field"]["name"]] = [user["login"] for user in _nested(value["users"])]
    return result


def collect(token, repository, project_owner, project_number, *, query=None):
    """Return a complete snapshot; any missing page or unavailable object fails the collection."""
    if (not isinstance(repository, str) or not re.fullmatch(r"[A-Za-z0-9-]+/[A-Za-z0-9_.-]+", repository)
            or repository.split("/")[1] in (".", "..") or not isinstance(project_owner, str)
            or not re.fullmatch(r"[A-Za-z0-9-]+", project_owner)
            or type(project_number) is not int or project_number < 1):
        raise ValueError("github_configuration_invalid")
    fetch = query if query is not None else lambda text, variables: _request(token, text, variables)

    def call(text, variables):
        data = fetch(text, variables)
        if not isinstance(data, dict) or data.get("errors"):
            raise ValueError("github_response_invalid")
        return data

    try:
        owner, name = repository.split("/")
        result = {}
        for kind, connection_name, text in (("issue", "issues", ISSUE_QUERY), ("pr", "pullRequests", PR_QUERY)):
            nodes = _pages(lambda cursor: call(text, {"owner": owner, "name": name, "cursor": cursor})
                           ["repository"][connection_name])
            for node in nodes:
                item = _normalize(node, kind, repository)
                if item["id"] in result:
                    raise ValueError("github_item_repeated")
                result[item["id"]] = item
        cards = _pages(lambda cursor: call(PROJECT_QUERY, {"login": project_owner, "number": project_number,
                              "cursor": cursor})["user"]["projectV2"]["items"])
        seen = set()
        for card in cards:
            content = card["content"]
            kind = {"Issue": "issue", "PullRequest": "pr"}.get(content["__typename"])
            if kind is None or content["repository"]["nameWithOwner"].casefold() != repository.casefold():
                continue
            identity = f"{kind}:{content['number']}"
            if identity in seen or identity not in result or type(card["isArchived"]) is not bool:
                raise ValueError("github_project_item_invalid")
            seen.add(identity)
            item, fields = result[identity], _project_fields(card)
            item.update(status=fields.get("Status", ""), priority=fields.get("优先级", ""),
                        next_step=fields.get("下一步", ""), archived=card["isArchived"])
            if kind == "issue" and fields.get("Assignees"):
                item.update(owners=fields["Assignees"], owner_source="project")
        return list(result.values())
    except (KeyError, TypeError, AttributeError, IndexError):
        raise ValueError("github_response_invalid") from None
