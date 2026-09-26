"""Verify actual MLX tokenization, prompt masking, sequence limits and data hashes."""
import os
os.environ['HF_HUB_OFFLINE']='1';os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from mlx_lm.utils import load_tokenizer
from mlx_lm.tuner.datasets import load_dataset, CacheDataset
from mlx_lm.lora import CONFIG_DEFAULTS
ROOT=Path(__file__).resolve().parents[1]
def main():
    os.chdir(ROOT)
    config=json.loads((ROOT/'training/config.json').read_text());args=SimpleNamespace(**{**CONFIG_DEFAULTS,**config})
    tokenizer=load_tokenizer(ROOT/'.cache/hf-base',tokenizer_config_extra={'trust_remote_code':False})
    sets=load_dataset(args,tokenizer)
    report={}
    for name,dataset in zip(['train','valid','test'],sets):
        dataset=CacheDataset(dataset)
        maximum=0;masked=0;supervised=0
        for i in range(len(dataset)):
            ids,offset=dataset[i]
            assert 0<offset<len(ids)<=1024,(name,i,len(ids),offset)
            maximum=max(maximum,len(ids));masked+=offset;supervised+=len(ids)-offset
        report[name]=dict(examples=len(dataset),maxTokens=maximum,maskedPromptTokens=masked,supervisedTokens=supervised,sha256=hashlib.sha256((ROOT/f'data/{name}.jsonl').read_bytes()).hexdigest())
    (ROOT/'reports/training-data-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
