"""Fuse the best local adapter and convert through the pinned llama.cpp toolchain."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from package_model import package, digest
ROOT=Path(__file__).resolve().parents[1]
def run(args):subprocess.run([str(x) for x in args],cwd=ROOT,check=True)
def main():
    os.environ['HF_HUB_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
    fused=ROOT/'artifacts/training/fused';output=ROOT/'artifacts/models';output.mkdir(parents=True,exist_ok=True)
    summary=json.loads((ROOT/'artifacts/training/summary.json').read_text())
    if summary['stepsCompleted']!=600:raise ValueError('Expected the completed 600-step training run.')
    run([sys.executable,'-m','mlx_lm.fuse','--model','.cache/hf-base','--adapter-path','artifacts/training/best','--save-path',fused])
    # Fusion must not change tokenizer/template/special-token semantics.
    for name in ['tokenizer.json','tokenizer_config.json','config.json','generation_config.json','special_tokens_map.json','merges.txt','vocab.json']:
        source=ROOT/'.cache/hf-base'/name
        if source.exists():shutil.copy2(source,fused/name)
    f16=output/'aster-tuned-f16.gguf'
    run([sys.executable,'.cache/llama.cpp/convert_hf_to_gguf.py',fused,'--outfile',f16,'--outtype','f16'])
    for quant in ['Q8_0','Q4_0']:
        path=output/f'aster-tuned-{quant.lower()}.gguf'
        run(['.cache/llama-build/bin/llama-quantize',f16,path,quant])
        package('tuned-'+('q8' if quant=='Q8_0' else 'q4'),path,quant,trained=True)
        package('tuned-'+('q8' if quant=='Q8_0' else 'q4'),path,quant,trained=True,portable=True)
    info=dict(tokenizerSha256=digest(fused/'tokenizer.json'),tokenizerConfigSha256=digest(fused/'tokenizer_config.json'),fusedWeightsSha256=digest(fused/'model.safetensors'),f16Sha256=digest(f16))
    (ROOT/'artifacts/training/export.json').write_text(json.dumps(info,indent=2)+'\n')
    print('Exported Q8_0 and Q4_0. The default remains unchanged until evaluation passes.')
if __name__=='__main__':main()
