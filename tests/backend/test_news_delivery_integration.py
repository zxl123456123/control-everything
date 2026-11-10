"""Real loopback routes and scheduled collection use only synthetic profile data."""
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from control_everything.http.gateway import build_profile_server


class DeliveryIntegrationTests(unittest.TestCase):
    def test_settings_cas_and_background_run_without_reader_page(self):
        observed = []
        now = datetime(2026, 10, 28, 8, 0, tzinfo=timezone.utc)

        class Batch:
            def __init__(self, root, sources, run_id, revision, deadline, stop):
                self.sources = sources

            def run(self):
                observed.append(copy.deepcopy(self.sources))
                frames = []
                for source in self.sources:
                    url = 'https://news.example.test/' + source['id']
                    row = {'id': hashlib.sha256((source['id'] + ':' + url).encode()).hexdigest()[:24],
                           'source_id': source['id'], 'source_name': source['name'], 'url': url,
                           'title': 'Scheduled fixture', 'summary': 'Synthetic body', 'fetched_at': now.isoformat()}
                    frames.append({'source_id': source['id'], 'reason': None,
                                   'result': {'items': [row]}, 'fetched_at': now.isoformat()})
                return frames, None, True

        with tempfile.TemporaryDirectory() as directory:
            source = Mock()
            source.acquire.return_value = 'synthetic-lease'
            server = build_profile_server(Path(directory), 0, news_source=source)
            reader = server.news_reader
            reader.runtime.clock = lambda: now
            reader.runtime.feed_runner = Batch
            thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
            thread.start()

            def request(path, body=None):
                headers = {'Origin': server.local_origin, 'X-Session-Client': 'panel',
                           'X-Session-CSRF': server.csrf_token, 'Content-Type': 'application/json'}
                data = None if body is None else json.dumps(body).encode()
                req = Request(server.local_origin + path, data=data, headers=headers)
                try:
                    response = urlopen(req, timeout=3)
                except HTTPError as failure:
                    response = failure
                with response:
                    return response.status, json.loads(response.read())

            try:
                status, initial = request('/api/workspace/news/settings')
                self.assertEqual(status, 200)
                self.assertFalse(initial['settings']['schedule']['enabled'])
                settings = initial['settings']
                settings['schedule'].update(enabled=True, mode='interval', interval_minutes=15)
                body = {'expected_revision': settings['revision'],
                        **{key: settings[key] for key in ('sources', 'view', 'schedule')}}
                status, saved = request('/api/workspace/news/settings', body)
                self.assertEqual((status, saved['settings']['revision']), (200, 1))
                self.assertEqual(saved['runtime']['next_run_at'], (now + timedelta(minutes=15)).isoformat())
                self.assertEqual(request('/api/workspace/news/settings', body)[0], 409)
                self.assertEqual(observed, [])
                # No reader page was opened; the service-owned deadline admits the batch.
                reader.runtime.tick(now + timedelta(minutes=15))
                reader.runtime.worker.join(3)
                self.assertFalse(reader.runtime.worker.is_alive())
                self.assertEqual(len(observed), 1)
                status, current = request('/api/workspace/news/reader')
                self.assertEqual(status, 200)
                self.assertEqual(current['runtime']['result'], 'success')
                self.assertEqual(current['settings_revision'], 1)
                self.assertTrue(current['sample']['streams']['ai']['items'])
                self.assertEqual([row['id'] for row in current['sections']['sections']], ['ai', 'hn'])
                source.get.assert_not_called()
                source.refresh.assert_not_called()
            finally:
                server.shutdown()
                thread.join(3)
                server.server_close()
            self.assertEqual(reader.runtime.owner, 'closed')
            self.assertFalse(reader.runtime.thread.is_alive())
            source.release.assert_called_once_with('synthetic-lease')
