"""Apply the reviewed repair to pinned Flare sources without overwriting unknown edits."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def apply(source_root=None):
    source_root = source_root or ROOT / '.cache/flare'
    hashes = json.loads((ROOT / 'patches/flare-smollm2.hashes.json').read_text())
    revision = json.loads((ROOT / 'runtime-lock.json').read_text())['flare']
    marker = source_root / '.source-revision'
    if not marker.exists() or marker.read_text().strip() != revision:
        raise RuntimeError('Flare source revision does not match runtime-lock.json')
    changed = []
    # Validate every target before changing any source file.
    for relative, versions in hashes.items():
        path = source_root / relative
        current = digest(path.read_bytes())
        if current not in versions.values():
            raise RuntimeError(f'{path} contains unrecognized edits; refusing to overwrite it.')
        if current != versions['after']:
            changed.append(relative)
    if not changed:
        print('Flare SmolLM2 repair already applied')
        return

    revision = json.loads((ROOT / 'runtime-lock.json').read_text())['flare']
    archive = ROOT / f'.cache/downloads/flare-{revision}.tar.gz'
    with tempfile.TemporaryDirectory(prefix='flare-patch-') as directory:
        staging = Path(directory)
        with tarfile.open(archive) as tar:
            for relative, versions in hashes.items():
                matches = [member for member in tar.getmembers() if member.name.endswith('/' + relative)]
                if len(matches) != 1:
                    raise RuntimeError(f'Expected one pinned source file: {relative}')
                original = tar.extractfile(matches[0]).read()
                if digest(original) != versions['before']:
                    raise RuntimeError(f'Pinned archive source hash mismatch: {relative}')
                target = staging / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(original)
        subprocess.run(['patch', '--batch', '-p1', '-i', str(ROOT / 'patches/flare-smollm2.patch')],
                       cwd=staging, check=True)
        for relative, versions in hashes.items():
            if digest((staging / relative).read_bytes()) != versions['after']:
                raise RuntimeError(f'Patched source hash mismatch: {relative}')
        for relative in changed:
            (source_root / relative).write_bytes((staging / relative).read_bytes())
    print(f'Applied Flare SmolLM2 repair to {len(changed)} source files')


if __name__ == '__main__':
    apply()
