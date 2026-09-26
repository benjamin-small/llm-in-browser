"""Verify portable Pages assets and that service-worker install does not fetch weights."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
dist=root/'dist'
lock=json.loads((root/'pages-assets.lock.json').read_text())
for name, expected in lock['files'].items():
    path=dist/name
    assert path.stat().st_size==expected['bytes'], name
    with path.open('rb') as stream: assert hashlib.file_digest(stream,'sha256').hexdigest()==expected['sha256'], name
sw=(dist/'sw.js').read_text()
files=json.loads(sw.split('const FILES=',1)[1].split(';',1)[0])
assert all(url.startswith('/llm-in-browser/') for url in files)
assert not any(url.endswith('.gguf') or url.endswith('tokenizer.json') for url in files)
registry=json.loads((dist/'models/registry.json').read_text())
assert registry['default']=='tuned-q4' and len(registry['models'])==1
manifest=json.loads((dist/'models/tuned-q4/manifest.json').read_text())
for entry in manifest['files'].values():
    assert not entry['path'].startswith('/'), entry
    assert (dist/'models/tuned-q4'/entry['path']).is_file(), entry
assert '/llm-in-browser/assets/' in (dist/'index.html').read_text()
print('Pages integrity, base paths, model manifest and deferred weight caching verified.')
