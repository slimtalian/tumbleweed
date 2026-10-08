"""Data-loss, recovery and import cases found in the application review."""
import base64
import copy
import http.client
import io
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
import uuid
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server as app
from test_workspace import fixture


class RegressionTests(unittest.TestCase):
    def setUp(self):
        folder = Path(os.environ.get('TUMBLEWEED_TEST_ROOT', app.ROOT / 'test-results')) / uuid.uuid4().hex
        self.store = app.Store(folder)

    def mutate(self, **request):
        return self.store.mutate({'revision': self.store.state['revision'], **request})

    def import_graph(self, graph, accepted=None):
        preview = self.store.preview(graph, 'review')
        self.mutate(action='import', token=preview['token'], accepted=accepted or [])

    def test_one_conflict_selection_cannot_overwrite_other_item_types(self):
        graph = fixture()
        graph['sources'].append({'id': 'a', 'title': 'Independent source', 'sensitivity': 'general'})
        self.import_graph(graph)
        updated = copy.deepcopy(graph)
        updated['records'][0]['title'] = 'Changed record'
        updated['sources'][-1]['title'] = 'Changed source'
        self.import_graph(updated, [{'group': 'records', 'id': 'review::a'}])
        self.assertEqual(self.store.state['records']['review::a']['raw']['title'], 'Changed record')
        self.assertEqual(self.store.state['sources']['review::a']['raw']['title'], 'Independent source')

    def test_ambiguous_legacy_conflict_selection_is_rejected_without_data_loss(self):
        graph = fixture()
        graph['sources'].append({'id': 'a', 'title': 'Independent source', 'sensitivity': 'general'})
        self.import_graph(graph)
        before = self.store.path.read_bytes()
        graph['records'][0]['title'] = 'Changed record'
        graph['sources'][-1]['title'] = 'Changed source'
        with self.assertRaisesRegex(ValueError, 'multiple item types'):
            self.import_graph(graph, ['review::a'])
        self.assertEqual(self.store.path.read_bytes(), before)

    def test_source_only_bundle_is_validated_on_restore(self):
        graph = {'schema_version': '1.0', 'records': [], 'edges': [], 'sources': [{'id': 'source', 'title': 'Source', 'sensitivity': 'general'}]}
        self.import_graph(graph)
        valid = copy.deepcopy(self.store.state)
        before = self.store.path.read_bytes()
        for damage in ('title', 'identity', 'sensitivity', 'namespace'):
            invalid = copy.deepcopy(valid)
            source = invalid['sources']['review::source']
            if damage == 'title': source['raw']['title'] = []
            elif damage == 'identity': source['external_id'] = 'wrong'
            elif damage == 'sensitivity': source['raw']['sensitivity'] = 'sensitive'
            else: source['namespace'] = None
            with self.subTest(damage=damage), self.assertRaises(ValueError):
                self.mutate(action='restore', backup=invalid)
            self.assertEqual(self.store.path.read_bytes(), before)

    def test_annotation_edit_keeps_imported_project_and_tasks(self):
        graph = fixture()
        graph['records'][0].update(kind='project', status='completed', tasks=[{'text': 'Historical task', 'done': True}])
        self.import_graph(graph)
        raw = copy.deepcopy(self.store.state['records']['review::a']['raw'])
        self.mutate(action='save-record', record={'id': 'review::a', 'title': 'My label', 'summary': 'My reflection'})
        record = self.store.state['records']['review::a']
        self.assertEqual(record['raw'], raw)
        self.assertNotIn('kind', record['annotations'])
        self.assertNotIn('tasks', record['annotations'])

    def test_failed_disk_replace_retains_both_memory_and_last_saved_file(self):
        before = self.store.path.read_bytes()
        state = copy.deepcopy(self.store.state)
        with patch.object(app.os, 'replace', side_effect=OSError('Disk unavailable')):
            with self.assertRaises(OSError):
                self.mutate(action='save-record', record={'title': 'Unsaved note', 'kind': 'note'})
        self.assertEqual(self.store.state, state)
        self.assertEqual(self.store.path.read_bytes(), before)
        self.assertEqual(app.Store(self.store.folder).state, state)

    def test_workspace_size_limit_is_atomic(self):
        before = self.store.path.read_bytes()
        state = copy.deepcopy(self.store.state)
        with patch.object(app, 'MAX_WORKSPACE_BYTES', len(before) + 10):
            with self.assertRaisesRegex(ValueError, 'workspace|Workspace'):
                self.mutate(action='save-record', record={'title': 'Too large', 'summary': 'x' * 1000, 'kind': 'note'})
        self.assertEqual(self.store.path.read_bytes(), before)
        self.assertEqual(self.store.state, state)

    def test_brief_file_lock_retries_without_truncating_saved_data(self):
        original_replace = app.os.replace
        attempts = []
        def temporarily_locked(source, destination):
            attempts.append(self.store.path.read_bytes())
            if len(attempts) < 3:
                raise PermissionError('File is temporarily in use')
            original_replace(source, destination)
        before = self.store.path.read_bytes()
        with patch.object(app.os, 'replace', side_effect=temporarily_locked), patch.object(app.time, 'sleep'):
            self.mutate(action='save-record', record={'title': 'Saved after retry', 'kind': 'note'})
        self.assertEqual(attempts, [before, before, before])
        self.assertEqual(app.Store(self.store.folder).state, self.store.state)

    def test_markdown_examples_do_not_become_titles_topics_or_backlinks(self):
        content = '---\naliases: ["[[B]]"]\ntags: [real]\n---\n```md\n# Example title\n#example [[B]]\n````\n# Actual title\n#useful `#inline [[B]]`'
        graph = app.markdown_graph([{'path': 'a.md', 'text': content}, {'path': 'B.md', 'text': '# B'}])
        self.assertEqual(graph['records'][0]['title'], 'Actual title')
        self.assertEqual(graph['records'][0]['topics'], ['real', 'useful'])
        self.assertEqual(graph['records'][0]['summary'], content)
        self.assertEqual(graph['edges'], [])

    def test_unclosed_fenced_code_cannot_create_links(self):
        graph = app.markdown_graph([{'path': 'a.md', 'text': '# Actual\n~~~md\n#not-a-topic [[B]]'}, {'path': 'B.md', 'text': '# B'}])
        self.assertEqual(graph['records'][0]['topics'], [])
        self.assertEqual(graph['edges'], [])

    def test_uppercase_markdown_extension_resolves_local_backlink(self):
        graph = app.markdown_graph([{'path': 'a.md', 'text': '[B](B.MD) [[B.MD]]'}, {'path': 'B.MD', 'text': '# B'}])
        self.assertEqual(len(graph['edges']), 1)
        self.assertEqual(graph['edges'][0]['to'], graph['records'][1]['id'])

    def test_external_and_same_note_anchors_are_not_missing_notes(self):
        graph = app.markdown_graph([{'path': 'a.md', 'text': '[Remote](https://example.com/note.md) [[#Section]]'}])
        self.assertEqual(graph['edges'], [])
        self.assertEqual(graph['unresolved_links'], [])

    def test_malformed_request_does_not_change_saved_state(self):
        before = self.store.path.read_bytes()
        for request in ([], None, 'bad'):
            with self.assertRaises(ValueError):
                self.store.mutate(request)
        self.assertEqual(self.store.path.read_bytes(), before)

    def test_http_restore_exceeds_import_limit_but_preserves_small_save_limit(self):
        self.mutate(action='save-record', record={'title': 'Large backup', 'kind': 'note', 'summary': 'x' * 4096})
        backup = copy.deepcopy(self.store.state)
        with self.http() as request, patch.object(app, 'MAX_BYTES', 1024):
            status, payload = request('/api/restore', {'action': 'restore', 'revision': self.store.state['revision'], 'backup': backup})
            self.assertEqual(status, 200, payload)
            status, _ = request('/api/mutate', {'action': 'save-record', 'revision': self.store.state['revision'], 'record': {'title': 'Large', 'kind': 'note', 'summary': 'x' * 4096}})
            self.assertEqual(status, 400)
            status, _ = request('/api/restore', {'action': 'save-record', 'revision': self.store.state['revision'], 'record': {'title': 'Wrong endpoint', 'kind': 'note'}})
            self.assertEqual(status, 400)

    def test_zip_ignores_excluded_files_before_utf8_decoding(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('note.md', '# A real note')
            archive.writestr('.hidden/bad.md', b'\xff\xfe')
        with self.http() as request:
            status, payload = request('/api/preview', {'namespace': 'zip-test', 'zip': base64.b64encode(buffer.getvalue()).decode()})
            self.assertEqual(status, 200, payload)
            self.assertEqual(payload['records'], 1)

    def http(self):
        from contextlib import contextmanager
        @contextmanager
        def running():
            server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.make_handler(self.store))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
            connection.request('GET', '/api/state')
            token = json.loads(connection.getresponse().read())['token']
            def request(route, body):
                connection.request('POST', route, json.dumps(body), {'Content-Type': 'application/json', 'X-Tumbleweed-Token': token})
                response = connection.getresponse()
                return response.status, json.loads(response.read())
            try:
                yield request
            finally:
                connection.close()
                server.shutdown()
                server.server_close()
                thread.join()
        return running()


if __name__ == '__main__':
    unittest.main()
