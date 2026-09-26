"""Build the app and its offline shell; model files are cached after hash verification."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--pages',action='store_true')
    parser.add_argument('--base',default='/')
    args=parser.parse_args()
    base='/'+args.base.strip('/')+'/' if args.base.strip('/') else '/'
    if not args.pages: subprocess.run(['wasm-pack','build','crates/station-core','--target','web','--release','--out-dir','../../.cache/station-pkg','--','--locked','--offline'],cwd=ROOT,check=True)
    for name,source in ([] if args.pages else [('flare','flare-pkg'),('station','station-pkg')]):
        dest=ROOT/'public/runtime'/name;dest.mkdir(parents=True,exist_ok=True)
        for path in (ROOT/'.cache'/source).iterdir():
            if path.suffix in ['.js','.wasm']:shutil.copy2(path,dest/path.name)
    subprocess.run(['node','node_modules/typescript/bin/tsc','--noEmit'],cwd=ROOT,check=True)
    subprocess.run(['node','node_modules/vite/bin/vite.js','build','--base',base],cwd=ROOT,check=True)
    dist=ROOT/'dist'
    if args.pages:
        from pages_release import install, DEST
        install()
        shutil.rmtree(dist/'models',ignore_errors=True)
        shutil.copytree(DEST,dist,dirs_exist_ok=True)
        (dist/'models/registry.json').write_text(json.dumps({'default':'tuned-q4','models':[{'id':'tuned-q4','name':'Tuned SmolLM2 · Q4_0','manifest':'/models/tuned-q4/manifest.json'}]},indent=2)+'\n')
        (dist/'.nojekyll').touch()
    registry_path=dist/'models/registry.json';registry=json.loads(registry_path.read_text())
    available=[]
    for entry in registry['models']:
        manifest=json.loads((dist/entry['manifest'].lstrip('/')).read_text())
        if args.pages or (ROOT/manifest['files']['weights']['path'].lstrip('/')).is_file():available.append(entry)
    registry['models']=available
    if registry['default'] not in {m['id'] for m in available}:registry['default']='base-q8'
    registry_path.write_text(json.dumps(registry,indent=2)+'\n')
    # Model weights/tokenizers are cached only by the worker after explicit loading.
    files=sorted(p for p in dist.rglob('*') if p.is_file() and p.name != 'sw.js'
                 and ('models' not in p.relative_to(dist).parts or p.name in ['manifest.json','registry.json']))
    revision=hashlib.sha256(b''.join(hashlib.sha256(p.read_bytes()).digest() for p in files)).hexdigest()[:16]
    urls=[base]+[base+str(p.relative_to(dist)) for p in files]
    service_worker='''const CACHE='aster-shell-REVISION';
const FILES=FILES_JSON;
const BASE=BASE_JSON;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aster-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE)||event.request.method!=='GET'||url.pathname.startsWith('/runtime-proof/')||url.pathname.startsWith('/reference/')||url.pathname.startsWith('/api/'))return;
  // Navigation is network-first for updates; the compiled shell works offline.
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(BASE)));return;}
  if(url.pathname.endsWith('.json')){event.respondWith(fetch(event.request).then(response=>response.ok?response:caches.match(event.request).then(c=>c||response)).catch(()=>caches.match(event.request)));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
'''.replace('REVISION',revision).replace('FILES_JSON',json.dumps(urls)).replace('BASE_JSON',json.dumps(base))
    (dist/'sw.js').write_text(service_worker)
    print(f'Offline shell: {len(files)} files, revision {revision}')
if __name__=='__main__':main()
