"""Build a source-only ZIP from an explicit, reviewed file allowlist."""
import argparse
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def release_files():
    names = (ROOT / 'RELEASE_FILES.txt').read_text(encoding='utf8').splitlines()
    result, seen = [], set()
    for name in names:
        if not name or name.startswith('#'):
            continue
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name:
            raise ValueError('Release entries must be relative source paths.')
        if name in seen:
            raise ValueError('Duplicate release entry: ' + name)
        path = ROOT.joinpath(*rel.parts)
        path.resolve().relative_to(ROOT.resolve())
        if any(p in {'data', 'bundle', 'backups', 'exports', 'private', 'test-results', '.git', '__pycache__'} for p in rel.parts):
            raise ValueError('Runtime or private folder is not a release source: ' + name)
        if any(ROOT.joinpath(*rel.parts[:i]).is_symlink() for i in range(1, len(rel.parts) + 1)) or not path.is_file():
            raise ValueError('Release entry must be a regular source file: ' + name)
        if path.name in {'workspace.json', 'workspace.pending', '.env'} or path.suffix in {'.log', '.pid', '.pyc'}:
            raise ValueError('Runtime file is not a release source: ' + name)
        seen.add(name)
        result.append((name, path))
    return result


def package(output):
    sources = release_files()
    output = Path(output).resolve()
    if output in {p.resolve() for _, p in sources}:
        raise ValueError('Output must not replace a source file.')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects an existing reviewed release.
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in sources:
            archive.write(path, 'tumbleweed/' + name)
    return len(sources)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/tumbleweed.zip')
    args = parser.parse_args()
    count = package(args.output)
    print(f'Packaged {count} source files into {args.output}')
