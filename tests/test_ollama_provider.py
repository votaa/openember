import sys
import json
import unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'streamlit'))
from ollama_provider import configuration, stream_chat, provider_status, ProviderError


class Response:
    def __init__(self, frames=(), status=200, models=None):
        self.status_code, self.frames, self.models = status, frames, models
        self.closed = False
    def __enter__(self): return self
    def __exit__(self, *_): self.closed = True
    def json(self): return {'models': self.models}
    def iter_lines(self, **kwargs):
        for frame in self.frames:
            if isinstance(frame, Exception): raise frame
            yield frame if isinstance(frame, str) else json.dumps(frame)


ANSWER = {'message': {'content': 'Answer'}, 'done': True}
MESSAGES = [{'role': 'system', 'content': 'grounded'}, {'role': 'user', 'content': 'question'}]


def config(**env):
    values = {'OLLAMA_API_KEY': 'test-secret', **env}
    return configuration(lambda key, default='': values.get(key, default))


def mock(models=None, local=None, cloud=None):
    http = Mock()
    http.get.return_value = Response(models=[{'name': 'qwen3:8b'}] if models is None else models)
    http.post.side_effect = lambda url, **kwargs: (cloud or Response([ANSWER])) if url.startswith('https://ollama.com') else (local or Response([ANSWER]))
    return http


class OllamaTests(unittest.TestCase):
    def test_separate_local_timeout_and_wrapped_read_timeout(self):
        import requests
        from urllib3.exceptions import ReadTimeoutError
        self.assertEqual(config()['local_stream_timeout'], 900)
        self.assertEqual(config()['stream_timeout'], 90)
        with self.assertRaises(ProviderError):
            config(OLLAMA_LOCAL_STREAM_TIMEOUT_MS='0')
        for mode, expected in [('local-only', 900), ('cloud-only', 90)]:
            http = mock()
            list(stream_chat(MESSAGES, config(OLLAMA_MODE=mode), http))
            self.assertEqual(http.post.call_args.kwargs['timeout'], (3, expected))
        for exc in (requests.exceptions.ReadTimeout(), requests.exceptions.ConnectionError(ReadTimeoutError(None, '/', 'private'))):
            http = mock(local=Response([exc]))
            result = list(stream_chat(MESSAGES, config(OLLAMA_MODE='local-only'), http))
            self.assertEqual(result[-1]['error']['code'], 'timeout')
            self.assertIn('before its first output', result[-1]['error']['message'])
            self.assertNotIn('private', json.dumps(result))
            http = mock(local=Response([{'message': {'content': 'partial'}}, exc]))
            result = list(stream_chat(MESSAGES, config(OLLAMA_MODE='local-only'), http))
            self.assertTrue(result[-1]['error']['partial'])
            self.assertIn('more output', result[-1]['error']['message'])

    def test_real_http_slow_local_headers_and_stream_timeout(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        from time import sleep
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                self.send_response(200); self.end_headers()
                self.wfile.write(json.dumps({'models': [{'name': 'qwen3:8b'}]}).encode())
            def do_POST(self):
                self.rfile.read(int(self.headers['Content-Length']))
                sleep(0.05)
                self.send_response(200); self.end_headers()
                self.wfile.write(b'{"message":{"content":"partial"}}\n'); self.wfile.flush()
                sleep(0.05)
                self.wfile.write(b'{"done":true}\n')
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        worker = Thread(target=server.serve_forever, daemon=True); worker.start()
        try:
            settings = config(OLLAMA_MODE='local-only', OLLAMA_API_KEY='',
                              OLLAMA_LOCAL_HOST=f'http://127.0.0.1:{server.server_port}',
                              OLLAMA_STREAM_TIMEOUT_MS='10', OLLAMA_LOCAL_STREAM_TIMEOUT_MS='500')
            result = list(stream_chat(MESSAGES, settings))
            self.assertEqual(result[0]['provider']['provider'], 'local')
            self.assertTrue(result[-1]['done'])
            settings['local_stream_timeout'] = 0.08
            # Headers and first output fit; a later socket read stall times out.
            def stalled(handler):
                handler.rfile.read(int(handler.headers['Content-Length']))
                handler.send_response(200); handler.end_headers()
                handler.wfile.write(b'{"message":{"content":"partial"}}\n'); handler.wfile.flush()
                sleep(0.15)
            Handler.do_POST = stalled
            result = list(stream_chat(MESSAGES, settings))
            self.assertEqual(result[-1]['error']['code'], 'timeout')
            self.assertTrue(result[-1]['error']['partial'])
            self.assertIn('more output', result[-1]['error']['message'])
        finally:
            server.shutdown(); server.server_close(); worker.join(1)

    def test_local_thinking_controls(self):
        for value in ('default', 'true', 'false'):
            http = mock()
            list(stream_chat(MESSAGES, config(OLLAMA_LOCAL_THINK=value), http))
            self.assertEqual(http.post.call_args.kwargs['json'].get('think'),
                             None if value == 'default' else value == 'true')
            http = mock(models=[])
            list(stream_chat(MESSAGES, config(OLLAMA_LOCAL_THINK=value), http))
            self.assertNotIn('think', http.post.call_args.kwargs['json'])
        with self.assertRaises(ProviderError):
            config(OLLAMA_LOCAL_THINK='off')

    def test_local_memory_cleanup_is_validated_and_never_sent_to_cloud(self):
        for value in ('default', '0'):
            http = mock()
            list(stream_chat(MESSAGES, config(OLLAMA_LOCAL_KEEP_ALIVE=value), http))
            self.assertEqual(http.post.call_args.kwargs['json'].get('keep_alive'),
                             0 if value == '0' else None)
            http = mock(models=[])
            list(stream_chat(MESSAGES, config(OLLAMA_LOCAL_KEEP_ALIVE=value), http))
            self.assertNotIn('keep_alive', http.post.call_args.kwargs['json'])
        with self.assertRaises(ProviderError):
            config(OLLAMA_LOCAL_KEEP_ALIVE='-1')

    def test_configuration(self):
        self.assertEqual(config()['mode'], 'local-first')
        self.assertEqual(config(OLLAMA_CLOUD_MODEL='custom')['cloud_model'], 'custom')
        self.assertEqual(config(OLLAMA_MODEL='legacy')['cloud_model'], 'legacy')
        for env in ({'OLLAMA_MODE': 'oops'}, {'OLLAMA_STREAM_TIMEOUT_MS': '-1'}, {'OLLAMA_LOCAL_HOST': 'ftp://invalid'}):
            with self.assertRaises(ProviderError): config(**env)

    def test_local_without_key_no_cloud_or_credentials(self):
        http = mock()
        result = list(stream_chat(MESSAGES, config(OLLAMA_API_KEY=''), http))
        self.assertEqual(result[0]['provider']['provider'], 'local')
        self.assertEqual(http.post.call_count, 1)
        args = http.post.call_args.kwargs
        self.assertNotIn('Authorization', args['headers'])
        self.assertEqual(args['json']['messages'], MESSAGES)
        self.assertTrue(http.get.return_value.closed)

    def test_fallback_cases(self):
        cases = [mock(models=[]), mock(models=[{'name': 'qwen3:8b', 'remote_host': 'ollama.com'}])]
        cases += [mock(local=Response(status=s)) for s in (401, 404, 429, 500)]
        cases += [mock(local=Response([frame])) for frame in ('bad', {'error': 'private'}, None)]
        cases += [mock(local=Response([]))]
        for http in cases:
            with self.subTest(http=http):
                result = list(stream_chat(MESSAGES, config(), http))
                self.assertEqual(result[0]['provider']['provider'], 'cloud')
                self.assertTrue(result[0]['provider']['fallback'])
                self.assertIn('code', result[0]['provider']['attempts'][0])
                self.assertNotIn('private', json.dumps(result))
                self.assertEqual(http.post.call_args.kwargs['headers']['Authorization'], 'Bearer test-secret')

    def test_probe_failure_and_timeout_fallback(self):
        import requests
        for exc in (requests.exceptions.ConnectionError(), requests.exceptions.Timeout()):
            http = mock(); http.get.side_effect = exc
            result = list(stream_chat(MESSAGES, config(), http))
            self.assertEqual(result[0]['provider']['provider'], 'cloud')

    def test_local_only_never_cloud(self):
        http = mock(models=[])
        result = list(stream_chat(MESSAGES, config(OLLAMA_MODE='local-only'), http))
        self.assertEqual(result[-1]['error']['code'], 'no_provider'); http.post.assert_not_called()

    def test_cloud_only_never_local_and_missing_key_no_request(self):
        http = mock()
        result = list(stream_chat(MESSAGES, config(OLLAMA_MODE='cloud-only'), http))
        self.assertEqual(result[0]['provider']['provider'], 'cloud'); http.get.assert_not_called()
        http = mock()
        result = list(stream_chat(MESSAGES, config(OLLAMA_MODE='cloud-only', OLLAMA_API_KEY=''), http))
        self.assertEqual(result[-1]['error']['code'], 'no_provider'); http.post.assert_not_called()

    def test_partial_or_thinking_prevents_fallback(self):
        for frame in ({'message': {'content': 'partial'}}, {'message': {'thinking': 'thought'}}):
            for ending in ('bad', {'error': 'private'}, RuntimeError('private')):
                response = Response([frame, ending]); http = mock(local=response)
                result = list(stream_chat(MESSAGES, config(), http))
                self.assertTrue(result[-1]['error']['partial']); self.assertEqual(http.post.call_count, 1)
                self.assertTrue(response.closed)

    def test_early_eof(self):
        http = mock(local=Response([{'message': {'content': 'partial'}}]))
        result = list(stream_chat(MESSAGES, config(), http))
        self.assertEqual(result[-1]['error']['code'], 'interrupted'); self.assertEqual(http.post.call_count, 1)

    def test_generator_close_closes_response(self):
        response = Response([{'message': {'content': 'partial'}}, ANSWER]); http = mock(local=response)
        iterator = stream_chat(MESSAGES, config(), http); next(iterator); iterator.close()
        self.assertTrue(response.closed); self.assertEqual(http.post.call_count, 1)

    def test_status_no_cloud_calls_no_secret(self):
        http = mock(); status = provider_status(config(), http)
        self.assertEqual(status['provider'], 'local'); self.assertFalse(status['cloud']['verified'])
        self.assertNotIn('test-secret', json.dumps(status)); http.post.assert_not_called()


if __name__ == '__main__': unittest.main()
