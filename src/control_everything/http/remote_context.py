"""Trusted edge metadata for one immutable remote document and its requests."""

import re

from control_everything.integrations.remote_access import PROXY_HEADER

CONTEXT = re.compile(r"[A-Za-z0-9_-]{32}\Z")
SCOPE = re.compile(r"[a-f0-9]{64}\Z")


def access_for(server):
    connector = server.__dict__.get("remote_connector")
    return connector.remote_access if connector else server.__dict__.get("remote_access")


def remote_request(handler):
    return bool(handler.headers.get_all(PROXY_HEADER, []))


def metadata(handler):
    contexts = handler.headers.get_all("X-CE-Page-Context", [])
    scopes = handler.headers.get_all("X-CE-Storage-Scope", [])
    if (len(contexts) != 1 or not CONTEXT.fullmatch(contexts[0])
            or len(scopes) != 1 or not SCOPE.fullmatch(scopes[0])):
        return None
    return contexts[0], scopes[0]


def static_path(server, path):
    # Exactly the published assets, never arbitrary extensions or HTML entries.
    from control_everything.http.workbench import STUDIO_RESOURCES
    from control_everything.http.news_reader import ASSETS
    from control_everything.http.gateway import WEB_ASSETS
    resource = STUDIO_RESOURCES.get(path) or ASSETS.get(path) or WEB_ASSETS.get(path)
    if resource:
        return not resource[1].startswith("text/html")
    assets = server.__dict__.get("workbench_assets")
    name = path.removeprefix("/workbench/")
    return bool(assets and path.startswith("/workbench/") and name in assets.files and not name.endswith(".html"))


def inject(handler, body):
    if not remote_request(handler):
        return body
    values = metadata(handler)
    if values is None:
        raise ValueError("remote_context_required")
    context, scope = values
    tags = (f'<meta name="ce-remote-context" content="{context}">'
            f'<meta name="ce-storage-scope" content="{scope}">'
            '<script src="/remote-context.js"></script>').encode()
    # Validated alphabet contains no HTML metacharacters. Prepend before every script,
    # including pages whose minimal fixture has no head element.
    head = re.search(br"<head(?:\s[^>]*)?>", body, flags=re.I)
    position = head.end() if head else 0
    return body[:position] + tags + body[position:]
