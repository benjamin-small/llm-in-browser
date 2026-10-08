"""Package/install the pinned demo model and prebuilt WASM, without Git LFS."""
import argparse
import hashlib
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / 'pages-assets.lock.json'
DEST = ROOT / '.cache/pages-assets'

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def pack(tag):
    if not __import__("re").fullmatch(r"demo-v[0-9]+\.[0-9]+\.[0-9]+", tag):
        raise ValueError("Expected release tag demo-vMAJOR.MINOR.PATCH")
    stage = ROOT / 'artifacts/pages-release'
    stage.mkdir(parents=True, exist_ok=True)
    files = {}
    bundle = ROOT / 'artifacts/bundles/tuned-q4'
    manifest = json.loads((bundle / 'manifest.json').read_text())
    for entry in manifest['files'].values():
        path = bundle / entry['path']
        if path.stat().st_size != entry['bytes'] or digest(path) != entry['sha256']:
            raise ValueError(f'Bundle integrity mismatch: {path.name}')
    for path in bundle.iterdir():
        if path.is_file(): files['models/tuned-q4/' + path.name] = path
    for name in ['flare', 'station']:
        for path in (ROOT / 'public/runtime' / name).iterdir():
            if path.suffix in ['.wasm', '.js']: files[f'runtime/{name}/{path.name}'] = path
    for path in (ROOT / 'licenses').iterdir():
        if path.is_file(): files['licenses/' + path.name] = path
    archive = stage / f'aster-{tag}.zip'
    entries = {}
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for name, path in sorted(files.items()):
            out.write(path, name)
            entries[name] = {'bytes': path.stat().st_size, 'sha256': digest(path)}
    lock = {'version': 1, 'tag': tag,
            'url': f'https://github.com/benjamin-small/llm-in-browser/releases/download/{tag}/' + archive.name,
            'bytes': archive.stat().st_size, 'sha256': digest(archive), 'files': entries,
            'sourceHashes': {name: digest(ROOT/name) for name in ['runtime-lock.json', 'runtime-assets.lock.json', 'scripts/build_runtime.py', 'patches/flare-smollm2.hashes.json', 'patches/flare-smollm2.patch', 'crates/station-core/src/lib.rs', 'public/data/station.json', 'public/data/prompt.json']}}
    LOCK.write_text(json.dumps(lock, indent=2) + '\n')
    print(archive)

def install(archive=None):
    lock = json.loads(LOCK.read_text())
    for name, expected in lock['sourceHashes'].items():
        if digest(ROOT/name) != expected: raise ValueError(f'Source no longer matches release: {name}')
    if archive is None:
        archive = ROOT / '.cache' / f"aster-{lock['tag']}.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        if not archive.exists() or digest(archive) != lock['sha256']:
            temporary = archive.with_suffix('.download')
            with urllib.request.urlopen(lock['url'], timeout=120) as response, temporary.open('wb') as out:
                shutil.copyfileobj(response, out)
            temporary.replace(archive)
    if archive.stat().st_size != lock['bytes'] or digest(archive) != lock['sha256']:
        raise ValueError('Release archive integrity mismatch')
    with zipfile.ZipFile(archive) as bundle:
        if len(bundle.namelist()) != len(lock['files']) or set(bundle.namelist()) != set(lock['files']):
            raise ValueError('Unexpected release members')
        # Validate every member before changing installed assets; never extract arbitrary paths.
        for name, expected in lock['files'].items():
            if Path(name).is_absolute() or '..' in Path(name).parts: raise ValueError('Unsafe release path')
            with bundle.open(name) as stream:
                actual = hashlib.file_digest(stream, 'sha256').hexdigest()
            if bundle.getinfo(name).file_size != expected['bytes'] or actual != expected['sha256']:
                raise ValueError(f'Invalid release member: {name}')
        for name in lock['files']:
            target = DEST/name
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(name) as source, target.open('wb') as out: shutil.copyfileobj(source, out)
    print('Installed verified demo assets at', DEST)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['pack', 'install'])
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--tag', default='demo-v0.2.0')
    args = parser.parse_args()
    if args.command == 'pack': pack(args.tag)
    else: install(args.archive)
