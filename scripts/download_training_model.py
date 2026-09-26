"""Download immutable training weights in resumable, verified HTTP ranges."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
ROOT=Path(__file__).resolve().parents[1]
SIZE=723674912
SHA256='e6bffe7435d7ddc10fd3b9a9efd429dafbacb1cb17015fb5562664e7532bf86e'
def main():
    lock=json.loads((ROOT/'runtime-lock.json').read_text())
    dest=ROOT/'.cache/hf-base';dest.mkdir(parents=True,exist_ok=True)
    for name in ['config.json','generation_config.json','tokenizer.json','tokenizer_config.json']:
        shutil.copy2(ROOT/'.cache/models'/name,dest/name)
    target=dest/'model.safetensors'
    if target.exists():
        with target.open('rb') as f:
            if hashlib.file_digest(f,'sha256').hexdigest()==SHA256:print('Pinned training weights verified');return
        raise ValueError('Existing training weights have the wrong hash; move them aside before retrying.')
    url=f"https://huggingface.co/{lock['model']}/resolve/{lock['model_revision']}/model.safetensors"
    parts=ROOT/'.cache/training-download';parts.mkdir(exist_ok=True)
    chunk=32*1024*1024
    def fetch(start):
        end=min(start+chunk,SIZE)-1;part=parts/str(start)
        if part.exists() and part.stat().st_size==end-start+1:return part
        for attempt in range(6):
            offset=part.stat().st_size if part.exists() else 0
            if offset==end-start+1:break
            request=urllib.request.Request(url,headers={'Range':f'bytes={start+offset}-{end}'})
            with urllib.request.urlopen(request,timeout=120) as response:
                if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start+offset}-{end}/{SIZE}':raise ValueError('Server did not honor the requested range')
                with part.open('ab') as f:shutil.copyfileobj(response,f,1024*1024)
        if part.stat().st_size!=end-start+1:raise ValueError('Incomplete download range; rerun to resume')
        print(f'Downloaded training weights: bytes {start}–{end}',flush=True);return part
    with ThreadPoolExecutor(max_workers=8) as pool:paths=list(pool.map(fetch,range(0,SIZE,chunk)))
    pending=dest/'model.safetensors.partial';digest=hashlib.sha256()
    with pending.open('wb') as f:
        for path in paths:
            with path.open('rb') as source:
                while data:=source.read(4*1024*1024):digest.update(data);f.write(data)
    if digest.hexdigest()!=SHA256:raise ValueError('Downloaded training weights failed SHA-256 verification')
    pending.replace(target);print('Pinned training weights verified',flush=True)
if __name__=='__main__':main()
