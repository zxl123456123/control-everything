"""HTTP boundary checks for the standalone developer preview."""

from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import threading
import unittest

from tools.scripts.preview_studio import PreviewHandler, RESOURCES


class StudioPreviewServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), PreviewHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, path, method="GET"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_only_declared_resources_are_served(self):
        for path, (_filename, expected_type) in RESOURCES.items():
            with self.subTest(path=path):
                status, headers, content = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["Content-Type"], expected_type)
                self.assertEqual(int(headers["Content-Length"]), len(content))
                self.assertNotIn("\ufffd", content.decode("utf-8"))
                self.assertEqual(headers["Cache-Control"], "no-store")

    def test_private_files_directories_and_query_paths_are_not_exposed(self):
        for path in ["/AGENTS.md", "/.git/config", "/web/workspace/", "/work/", "/api/workspace/agents",
                     "/../AGENTS.md", "/%2e%2e/AGENTS.md", "/studio-preview.js?token=synthetic"]:
            with self.subTest(path=path):
                status, _headers, content = self.request(path)
                self.assertEqual(status, 404)
                self.assertNotIn(b"synthetic", content)

    def test_head_and_csp_do_not_enable_outer_business_requests(self):
        status, headers, content = self.request("/", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(content, b"")
        self.assertIn("connect-src 'none'", headers["Content-Security-Policy"])
        self.assertIn("frame-src http: https:", headers["Content-Security-Policy"])
        self.assertEqual(self.request("/", "POST")[0], 501)


if __name__ == "__main__":
    unittest.main()
