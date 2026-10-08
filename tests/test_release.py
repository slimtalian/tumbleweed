import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import package_release


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.environ.get('TUMBLEWEED_TEST_ROOT', ROOT / 'test-results')) / uuid.uuid4().hex
        self.root.mkdir(parents=True)

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf8')
        return path

    def test_archive_excludes_workspace_and_history_after_use(self):
        self.put('RELEASE_FILES.txt', 'server.py\npublic/app.js\n')
        self.put('server.py', '# application source')
        self.put('public/app.js', '// application source')
        for name in ('data/workspace.json', 'data/backups/previous.json', 'data/server.log',
                     'exports/notes.json', '.git/config', 'private/note.md'):
            self.put(name, 'PRIVATE_TEST_SENTINEL')
        with patch.object(package_release, 'ROOT', self.root):
            package_release.package(self.root / 'release.zip')
        with zipfile.ZipFile(self.root / 'release.zip') as archive:
            self.assertEqual(archive.namelist(), ['tumbleweed/server.py', 'tumbleweed/public/app.js'])
            self.assertTrue(all(b'PRIVATE_TEST_SENTINEL' not in archive.read(n) for n in archive.namelist()))

    def test_private_and_escaping_manifest_entries_are_rejected(self):
        for name in ('../note.md', 'data/workspace.json', 'public/../../note.md'):
            self.put('RELEASE_FILES.txt', name)
            with patch.object(package_release, 'ROOT', self.root), self.assertRaises(ValueError):
                package_release.package(self.root / 'release.zip')
            self.assertFalse((self.root / 'release.zip').exists())

    def test_existing_reviewed_release_is_not_overwritten(self):
        self.put('RELEASE_FILES.txt', 'server.py\n')
        self.put('server.py', '# source')
        previous = self.put('release.zip', 'previous reviewed release')
        with patch.object(package_release, 'ROOT', self.root), self.assertRaises(FileExistsError):
            package_release.package(previous)
        self.assertEqual(previous.read_text(), 'previous reviewed release')


if __name__ == '__main__':
    unittest.main()
