"""Serve only the standalone Studio preview resources on loopback."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2] / "web" / "workspace"
RESOURCES = {
    "/": ("studio-preview.html", "text/html; charset=utf-8"),
    "/studio-preview.html": ("studio-preview.html", "text/html; charset=utf-8"),
    "/studio-preview.css": ("studio-preview.css", "text/css; charset=utf-8"),
    "/studio-preview.js": ("studio-preview.js", "text/javascript; charset=utf-8"),
    "/orca-surface.css": ("orca-surface.css", "text/css; charset=utf-8"),
    "/orca-surface.js": ("orca-surface.js", "text/javascript; charset=utf-8"),
}


class PreviewHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._serve(include_body=True)

    def do_HEAD(self):
        self._serve(include_body=False)

    def _serve(self, *, include_body):
        resource = RESOURCES.get(self.path)
        if resource is None:
            self.send_error(404)
            return
        filename, content_type = resource
        try:
            content = (ROOT / filename).read_bytes()
        except OSError:
            self.send_error(503, "Preview resource unavailable")
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        # This policy applies only to the isolated preview, never the product gateway.
        self.send_header("Content-Security-Policy", (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "connect-src 'none'; frame-src http: https:; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
        ))
        self.end_headers()
        if include_body:
            self.wfile.write(content)

    def log_message(self, _format, *_args):
        # Do not copy user-supplied URL paths or query strings into logs.
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8769)
    args = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", args.port), PreviewHandler) as server:
        print(f"Studio preview: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
