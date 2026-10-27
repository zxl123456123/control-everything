"""Authenticated news-reader routes; browser and extraction work stays in workspace."""
import re
from urllib.parse import parse_qs

from control_everything.paths import web_root
from control_everything.workspace.news_reader import NewsReader

PREFIX = '/api/workspace/news/'
ASSETS = {'/news': ('news-reader.html', 'text/html; charset=utf-8'),
          '/news-reader.js': ('news-reader.js', 'text/javascript; charset=utf-8'),
          '/news-reader.css': ('news-reader.css', 'text/css; charset=utf-8'),
          '/news-spider.js': ('news-spider.js', 'text/javascript; charset=utf-8'),
          '/news-pets.js': ('news-pets.js', 'text/javascript; charset=utf-8'),
          '/news-pet-dial.js': ('news-pet-dial.js', 'text/javascript; charset=utf-8'),
          '/news-pet-prefs.js': ('news-pet-prefs.js', 'text/javascript; charset=utf-8'),
          '/news-pet-director.js': ('news-pet-director.js', 'text/javascript; charset=utf-8'),
          '/news-pet-status.js': ('news-pet-status.js', 'text/javascript; charset=utf-8'),
          '/news-naidragon.js': ('news-naidragon.js', 'text/javascript; charset=utf-8'),
          '/news-tabbycat.js': ('news-tabbycat.js', 'text/javascript; charset=utf-8')}
CSP = ("default-src 'self'; img-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; "
       "script-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; "
       "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")


def _reader(server):
    with server._news_reader_lock:
        if server._news_reader_closed:
            raise OSError('news_reader_closed')
        if server.news_reader is None:
            server.news_reader = NewsReader(server.news_reader_root, server.news_source)
        return server.news_reader


def _params(query, keys):
    values = parse_qs(query, keep_blank_values=True, strict_parsing=True)
    if set(values) != set(keys) or any(len(rows) != 1 for rows in values.values()):
        raise ValueError('invalid_query')
    return {key: rows[0] for key, rows in values.items()}


def handle_get(handler, path):
    if path.path in ASSETS:
        embedded = path.path == '/news' and path.query == 'embedded=1'
        if path.query and not embedded:
            handler.reject(400, 'invalid_query')
        else:
            name, mime = ASSETS[path.path]
            handler.reply(200, (web_root() / 'workspace' / name).read_bytes(), mime,
                          csp=CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'") if embedded else CSP)
        return True
    route = path.path.removeprefix(PREFIX)
    if not path.path.startswith(PREFIX) or route not in {'reader', 'article', 'research', 'research/latest', 'research-frame'}:
        return False
    try:
        reader = _reader(handler.server)
        if route == 'reader':
            _params(path.query, ())
            handler.reply(200, reader.sample())
        elif route == 'article':
            params = _params(path.query, ('id', 'retry') if 'retry' in parse_qs(path.query) else ('id',))
            identity = params['id']
            if not re.fullmatch('[a-f0-9]{24}', identity):
                raise ValueError('invalid_article')
            if 'retry' in params and params['retry'] != '1':
                raise ValueError('invalid_retry')
            doc = reader.article(identity, retry=True) if 'retry' in params else reader.article(identity)
            handler.reply(200 if doc else 404, doc or {'error': 'unknown_article'})
        elif route == 'research/latest':
            _params(path.query, ())
            handler.reply(200, {'job': reader.jobs.latest()})
        elif route == 'research':
            job = reader.jobs.snapshot(_params(path.query, ('id',))['id'])
            handler.reply(200 if job else 404, job or {'error': 'unknown_job'})
        else:
            params = _params(path.query, ('job', 'name'))
            file = reader.jobs.frame_path(params['job'], params['name'])
            if file:
                handler.reply(200, file.read_bytes(), 'image/jpeg')
            else:
                handler.reject(404, 'unknown_frame')
    except ConnectionError:
        pass
    except (ValueError, TypeError):
        handler.reject(400, 'invalid_request')
    except OSError:
        handler.reject(503, 'news_reader_unavailable')
    return True


def handle_post(handler, path):
    route = path.path.removeprefix(PREFIX)
    if not path.path.startswith(PREFIX) or route not in {'reader/refresh', 'research', 'translate'}:
        return False
    if path.query:
        handler.reject(400, 'invalid_query')
        return True
    body = handler.read_json_body(max_bytes=150000 if route == 'translate' else 2048, strict=True)
    try:
        reader = _reader(handler.server)
        if route == 'reader/refresh':
            if body != {}:
                raise ValueError('invalid_body')
            handler.reply(200, reader.sample(refresh=True))
        elif route == 'research':
            if (not isinstance(body, dict) or set(body) not in ({'query', 'topic'}, {'query', 'topic', 'capture_frames'})
                    or type(body.get('capture_frames', False)) is not bool):
                raise ValueError('invalid_body')
            handler.reply(202, reader.jobs.begin(body['query'], body['topic'], capture_frames=body.get('capture_frames', False)))
        else:
            if (not isinstance(body, dict) or set(body) != {'texts', 'source', 'target'}
                    or body['source'] != 'en' or body['target'] != 'zh'
                    or not isinstance(body['texts'], list) or not 1 <= len(body['texts']) <= 32
                    or any(not isinstance(text, str) or len(text) > 6000 for text in body['texts'])
                    or sum(map(len, body['texts'])) > 20000):
                raise ValueError('invalid_body')
            from control_everything.workspace.news_translation import translate_texts
            handler.reply(200, {'translations': translate_texts(body['texts']), 'provider': 'local'})
    except ConnectionError:
        pass
    except ValueError:
        handler.reject(400, 'invalid_request')
    except RuntimeError:
        if route == 'research':
            handler.reply(409, reader.jobs.latest())
        else:
            handler.reject(503, 'local_translation_unavailable')
    except (OSError, ImportError):
        handler.reject(503, 'local_translation_unavailable' if route == 'translate' else 'news_browser_unavailable')
    return True
