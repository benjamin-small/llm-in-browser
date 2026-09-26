"""Create a hash-verified bundle/manifest; never select an unvalidated model as default."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def package(id, weights, quantization, trained=False, portable=False):
    lock=json.loads((ROOT/'runtime-lock.json').read_text())
    destination=ROOT/('artifacts/bundles' if portable else 'public/models')/id;destination.mkdir(parents=True,exist_ok=True)
    files={}
    for role,path in {'weights':weights,'tokenizer':ROOT/'.cache/models/tokenizer.json','tokenizerConfig':ROOT/'.cache/models/tokenizer_config.json','config':ROOT/'.cache/models/config.json','generationConfig':ROOT/'.cache/models/generation_config.json'}.items():
        if portable:
            target=destination/path.name
            if not target.exists() or digest(target)!=digest(path):shutil.copy2(path,target)
            url=path.name
        else:url='/'+str(path.relative_to(ROOT))
        files[role]=dict(path=url,bytes=path.stat().st_size,sha256=digest(path))
    training=json.loads((ROOT/'artifacts/training/summary.json').read_text()) if trained else None
    manifest=dict(schemaVersion=1,id=id,name=f"{'Tuned' if trained else 'Base'} SmolLM2 · {quantization}",model=lock['model'],revision=lock['model_revision'],quantization=quantization,datasetVersion=training['dataset']['version'] if trained else None,training=training,
                  runtime={'flare':lock['flare'],'patchSha256':digest(ROOT/'patches/flare-smollm2.patch'),'llamaCpp':lock['llama_cpp']},files=files)
    manifest['quantizationNotes']='Default llama.cpp Q4_0 recipe: layer matrices Q4_0, tied embedding/output matrix Q8_0, normalization F32.' if quantization=='Q4_0' else 'Q8_0 matrices; normalization F32.'
    manifest['runtime']['weightStorage']='Q4_0 blocks are expanded losslessly to Q8_0 in WASM for CPU prefill and GPU decode; download quantization is unchanged.' if quantization=='Q4_0' else 'Q8_0 blocks are retained for CPU prefill and GPU decode.'
    (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    if not portable:
        registry_file=ROOT/'public/models/registry.json'
        registry=json.loads(registry_file.read_text()) if registry_file.exists() else {'default':'base-q8','models':[]}
        registry['models']=[m for m in registry['models'] if m['id']!=id]+[dict(id=id,name=manifest['name'],manifest=f'/models/{id}/manifest.json')]
        registry_file.write_text(json.dumps(registry,indent=2)+'\n')
    return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--id',default='base-q8');p.add_argument('--weights',default='.cache/models/smollm2-360m-instruct-q8_0.gguf');p.add_argument('--quantization',default='Q8_0',choices=['Q8_0','Q4_0']);p.add_argument('--trained',action='store_true');p.add_argument('--portable',action='store_true');a=p.parse_args()
    print(package(a.id,ROOT/a.weights,a.quantization,a.trained,a.portable)['name'])
