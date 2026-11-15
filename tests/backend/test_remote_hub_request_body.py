import io
import unittest
from email.message import Message
from unittest.mock import Mock, patch
from control_everything.http.remote_hub import build_server
from control_everything.integrations.remote_hub.identity import HubError


class RejectedBodyTests(unittest.TestCase):
    def handler(self, length='2', content_type='text/plain', transfer=None):
        server = build_server(('127.0.0.1', 0), Mock())
        self.addCleanup(server.server_close)
        handler = server.RequestHandlerClass.__new__(server.RequestHandlerClass)
        handler.headers = Message()
        handler.headers['Content-Length'] = length
        handler.headers['Content-Type'] = content_type
        if transfer:
            handler.headers['Transfer-Encoding'] = transfer
        handler.command = 'POST'
        handler.path = '/remote/producer/challenges'
        handler.rfile = io.BytesIO(b'{}')
        handler.wfile = io.BytesIO()
        handler.connection = Mock()
        handler.connection.gettimeout.return_value = 10
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        return handler

    def test_early_415_consumes_small_body(self):
        handler = self.handler()
        handler.handle_request()
        handler.send_response.assert_called_once_with(415)
        self.assertEqual(handler.wfile.getvalue(), b'{"error": "json_required"}')
        self.assertEqual(handler.rfile.tell(), 2)
        handler.connection.settimeout.assert_called_with(10)

    def test_dispatch_error_does_not_read_twice(self):
        handler = self.handler(content_type='application/json')
        handler.rfile = Mock(wraps=io.BytesIO(b'{}'))
        with patch('control_everything.http.remote_hub.dispatch', side_effect=HubError('denied', 403)):
            handler.handle_request()
        handler.rfile.read.assert_called_once_with(2)
        handler.rfile.read1.assert_not_called()

    def test_untrusted_or_large_framing_is_not_drained(self):
        for length, transfer in [('4097', None), ('20000', None), ('no', None), ('2', 'chunked')]:
            with self.subTest(length=length, transfer=transfer):
                handler = self.handler(length=length, transfer=transfer)
                handler.handle_request()
                self.assertEqual(handler.rfile.tell(), 0)

    def test_timeout_restores_connection(self):
        handler = self.handler()
        handler.rfile = Mock()
        handler.rfile.read1.side_effect = TimeoutError()
        handler.handle_request()
        handler.send_response.assert_called_once_with(415)
        handler.connection.settimeout.assert_called_with(10)

    def test_oversized_decimal_length_preserves_security_rejection(self):
        handler = self.handler(length='9' * 5000)
        handler.headers['Authorization'] = 'Bearer first'
        handler.headers['Authorization'] = 'Bearer second'
        handler.handle_request()
        handler.send_response.assert_called_once_with(400)
        self.assertEqual(handler.wfile.getvalue(), b'{"error": "ambiguous_security_header"}')
        self.assertEqual(handler.rfile.tell(), 0)
