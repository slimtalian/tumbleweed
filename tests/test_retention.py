"""Isolated retention regressions: never open the real data directory."""
import copy
from datetime import datetime, timezone
import inspect
import json
import os
from pathlib import Path
import sys
import uuid
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.environ.get('TUMBLEWEED_TEST_ROOT', server.ROOT / 'test-results')) / uuid.uuid4().hex
        self.root.mkdir(parents=True)
        self.folder = self.root / 'data'
        self.options = {'seed': False} if 'seed' in inspect.signature(server.Store).parameters else {}
        self.store = server.Store(self.folder, backup_count=3, backup_minimum=2, **self.options)

    def save(self, title='Test'):
        return self.store.mutate({'revision': self.store.state['revision'], 'action': 'save-record',
                                 'record': {'kind': 'note', 'title': title}})

    def snapshots(self):
        return sorted((self.folder / 'backups').glob('auto-*.json'))

    def old(self, day, size=0, suffix='0000000000000000'):
        folder = self.folder / 'backups'
        folder.mkdir(exist_ok=True)
        path = folder / f'auto-202001{day:02d}-000000-000000-{suffix}.json'
        content = json.dumps(self.store.state)
        path.write_text(content + ' ' * max(0, size-len(content)), encoding='utf8')
        return path

    def test_count_and_restoration(self):
        for i in range(8):
            self.save(str(i))
        snapshots = self.snapshots()
        self.assertEqual(len(snapshots), 3)
        saved = json.loads(snapshots[0].read_text())
        expected = copy.deepcopy(saved['records'])
        self.store.mutate({'revision': self.store.state['revision'], 'action': 'restore', 'backup': saved})
        self.assertEqual(self.store.state['records'], expected)
        self.assertEqual(server.Store(self.folder, **self.options).state, self.store.state)
        self.assertEqual(len(self.snapshots()), 3)

    def test_byte_target_and_minimum_override(self):
        self.store.backup_count = 50
        self.store.backup_bytes = 1000
        for day in range(1, 7):
            self.old(day, 1500)
        self.save()
        self.assertEqual(len(self.snapshots()), 2)
        self.assertGreater(sum(p.stat().st_size for p in self.snapshots()), 1000)

    def test_timestamp_order_not_modified_time(self):
        paths = [self.old(day) for day in range(1, 6)]
        for i, path in enumerate(paths):
            os.utime(path, (2000000000-i, 2000000000-i))
        self.save()
        self.assertEqual(set(self.snapshots()) & set(paths), set(paths[-2:]))

    def test_clock_rollback_keeps_immediate_previous_state(self):
        for day in range(1, 6):
            self.old(day)
        with patch.object(server, 'datetime', wraps=datetime) as clock:
            clock.now.return_value = datetime(1999, 1, 1, tzinfo=timezone.utc)
            self.save()
        self.assertTrue(any('19990101' in p.name for p in self.snapshots()))
        self.assertEqual(len(self.snapshots()), 3)

    def test_same_timestamp_never_overwrites_snapshot(self):
        with patch.object(server, 'datetime', wraps=datetime) as clock:
            clock.now.return_value = datetime(2026, 1, 1, tzinfo=timezone.utc)
            self.save('one')
            self.save('two')
        self.assertEqual(len(self.snapshots()), 2)
        self.assertEqual(sorted(json.loads(p.read_text())['revision'] for p in self.snapshots()), [0, 1])

    def test_replace_failure_does_not_prune_or_change_state(self):
        originals = {self.old(day) for day in range(1, 7)}
        before = self.store.path.read_bytes()
        state = copy.deepcopy(self.store.state)
        with patch.object(server.os, 'replace', side_effect=PermissionError), patch.object(server.time, 'sleep'):
            with self.assertRaises(PermissionError):
                self.save()
        self.assertEqual(self.store.path.read_bytes(), before)
        self.assertEqual(self.store.state, state)
        self.assertTrue(all(p.exists() for p in originals))

    def test_fsync_failure_does_not_prune(self):
        originals = {self.old(day) for day in range(1, 7)}
        before = self.store.path.read_bytes()
        with patch.object(server.os, 'fsync', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.save()
        self.assertEqual(self.store.path.read_bytes(), before)
        self.assertTrue(all(p.exists() for p in originals))

    def test_workspace_fsync_failure_does_not_prune(self):
        originals = {self.old(day) for day in range(1, 7)}
        before = self.store.path.read_bytes()
        with patch.object(server.os, 'fsync', side_effect=[None, OSError('disk full')]):
            with self.assertRaises(OSError):
                self.save()
        self.assertEqual(self.store.path.read_bytes(), before)
        self.assertTrue(all(p.exists() for p in originals))

    def test_cleanup_failure_does_not_report_save_failure(self):
        for day in range(1, 7):
            self.old(day)
        with patch.object(Path, 'unlink', side_effect=PermissionError), self.assertLogs(level='WARNING'):
            self.save()
        self.assertEqual(self.store.state, json.loads(self.store.path.read_text()))
        self.assertEqual(self.store.state['revision'], 1)

    def test_unmanaged_files_and_nested_directories_untouched(self):
        self.old(1)
        backups = self.folder / 'backups'
        names = ['export.json', 'workspace.json', '20200101-000000-000000.json',
                 'auto-20209999-000000-000000-0000000000000000.json', 'auto-not-a-date.json']
        untouched = [backups / name for name in names] + [self.root / 'export.json']
        for path in untouched:
            path.write_text('keep me')
        nested = backups / 'auto-20200101-000000-000000-1111111111111111.json'
        nested.mkdir()
        (nested / 'export.json').write_text('keep me')
        for _ in range(6):
            self.save()
        self.assertTrue(all(p.read_text() == 'keep me' for p in untouched))
        self.assertEqual((nested / 'export.json').read_text(), 'keep me')

    def test_links_are_not_candidates(self):
        target = self.root / 'outside.json'
        target.write_text('outside')
        hard = self.old(1)
        hard.unlink()
        os.link(target, hard)
        for _ in range(6):
            self.save()
        self.assertTrue(hard.exists())
        self.assertEqual(target.read_text(), 'outside')

    def test_reparse_directory_refused_before_save(self):
        before = self.store.path.read_bytes()
        original = server.plain_path
        with patch.object(server, 'plain_path', side_effect=lambda p, directory=False: False if directory else original(p)):
            with self.assertRaises(ValueError):
                self.save()
        self.assertEqual(self.store.path.read_bytes(), before)

    def test_disable_and_reopen_never_prune(self):
        for day in range(1, 7):
            self.old(day)
        self.store.backup_count = 0
        self.save()
        self.assertEqual(len(self.snapshots()), 7)
        server.Store(self.folder, backup_count=2, backup_minimum=1, **self.options)
        self.assertEqual(len(self.snapshots()), 7)

    def test_invalid_policy_rejected_before_files_created(self):
        for options in ({'backup_count': -1}, {'backup_count': 3}, {'backup_mib': 0}, {'backup_minimum': 0}, {'backup_count': True}):
            with self.assertRaises(ValueError):
                server.Store(self.root / 'invalid', **self.options, **options)
        self.assertFalse((self.root / 'invalid').exists())

    def test_corrupt_reserved_file_is_preserved(self):
        corrupt = self.old(1)
        corrupt.write_text('{not a workspace')
        for _ in range(6):
            self.save()
        self.assertEqual(corrupt.read_text(), '{not a workspace')

    def test_snapshot_name_collision_does_not_overwrite(self):
        with patch.object(server, 'datetime', wraps=datetime) as clock, patch.object(server.secrets, 'token_hex', return_value='a'*16):
            clock.now.return_value = datetime(2026, 1, 1, tzinfo=timezone.utc)
            self.save('one')
            original = self.snapshots()[0].read_bytes()
            before = self.store.path.read_bytes()
            with self.assertRaises(FileExistsError):
                self.save('two')
            self.assertEqual(self.snapshots()[0].read_bytes(), original)
            self.assertEqual(self.store.path.read_bytes(), before)

if __name__ == '__main__':
    unittest.main()

