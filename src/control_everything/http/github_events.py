"""Accept signed GitHub events and wake the existing durable delivery worker."""
import argparse
import json
from pathlib import Path
import os
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from control_everything.integrations.github_event_queue import accept_event, drain, retry_delay
from control_everything.integrations.progress_feishu import FeishuSender
from control_everything.integrations.progress_notifications import settings

HOOK_PATH = '/hooks/github/progress'
MAX_BODY = 25 * 1024 * 1024


class EventServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, handler):
        self.slots = threading.BoundedSemaphore(6)
        super().__init__(address, handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def make_server(config, secret, wake, *, address=('127.0.0.1', 19891)):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def respond(self, code, result):
            raw = json.dumps(result).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            self.respond(405 if self.path == HOOK_PATH else 404, {'status': 'method_or_path_rejected'})

        do_HEAD = do_PUT = do_DELETE = do_GET

        def do_POST(self):
            if self.path != HOOK_PATH:
                self.respond(404, {'status': 'not_found'})
                return
            if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
                self.respond(415, {'status': 'json_required'})
                return
            try:
                lengths = self.headers.get_all('Content-Length', [])
                size = int(lengths[0]) if len(lengths) == 1 else -1
                if self.headers.get('Transfer-Encoding') or size < 1:
                    self.respond(411, {'status': 'content_length_required'})
                    return
                if size > MAX_BODY:
                    self.respond(413, {'status': 'payload_too_large'})
                    return
                self.connection.settimeout(5)
                body = self.rfile.read(size)
                if len(body) != size:
                    raise ValueError('incomplete_body')
                result = accept_event(config, secret, self.headers.get('X-GitHub-Delivery', ''),
                    self.headers.get('X-GitHub-Event', ''), body, self.headers.get('X-Hub-Signature-256', ''))
            except PermissionError:
                self.respond(403, {'status': 'signature_rejected'})
            except (ValueError, TypeError, KeyError):
                self.respond(400, {'status': 'event_rejected'})
            except (OSError, sqlite3.Error):
                self.respond(503, {'status': 'not_persisted'})
            else:
                wake.set()
                self.respond(202, result)
    return EventServer(address, Handler)


def deliver_events(config, route, account, wake):
    delay = 0
    while True:
        wake.wait(delay)
        wake.clear()
        try:
            # A new batch gets a fresh short-lived token; no model or GitHub query is involved.
            result = drain(config, FeishuSender(account['appId'], account['appSecret'], route['target']))
            print(json.dumps({'worker': result}), flush=True)
            delay = retry_delay(config, time.time())
        except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as error:
            print('event_delivery_failed:' + type(error).__name__, file=sys.stderr, flush=True)
            delay = 120


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args(argv)
    config, route, account = settings(json.loads(args.config.read_text(encoding='utf-8-sig')))
    secret = Path(config['webhook_secret_file']).read_bytes().strip()
    if len(secret) < 32:
        raise ValueError('webhook_secret_too_short')
    retry_delay(config, time.time())
    wake = threading.Event()
    server = make_server(config, secret, wake)
    worker = threading.Thread(target=deliver_events, args=(config, route, account, wake), daemon=True)
    worker.start()
    print('github_event_receiver_ready', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    os.umask(0o077)
    raise SystemExit(main())
