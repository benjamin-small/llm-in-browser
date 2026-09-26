"""Local MLX-LM LoRA, retaining the actual weights with the lowest validation loss."""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
import importlib.metadata
import hashlib
import json
from pathlib import Path
import shutil
import time
from types import SimpleNamespace
import mlx.core as mx
from mlx.utils import tree_flatten
import numpy as np
from mlx_lm.utils import load
from mlx_lm.lora import CONFIG_DEFAULTS, train_model
from mlx_lm.tuner.datasets import load_dataset, CacheDataset
from mlx_lm.tuner.trainer import evaluate, TrainingCallback

ROOT=Path(__file__).resolve().parents[1]
def main():
    os.chdir(ROOT)
    dataset=json.loads((ROOT/'data/manifest.json').read_text())
    if not dataset.get('grounding','').startswith('Rust station-core'):
        raise RuntimeError('Dataset grounding is incomplete. Wait for npm run data:generate to finish.')
    def verify_dataset():
        for name,expected in dataset['files'].items():
            if hashlib.sha256((ROOT/'data'/name).read_bytes()).hexdigest()!=expected:
                raise RuntimeError(f'Dataset changed or is incomplete: {name}. Regenerate and restart training.')
    verify_dataset()
    from audit_training import main as audit_data
    audit_data()
    config=json.loads((ROOT/'training/config.json').read_text());args=SimpleNamespace(**{**CONFIG_DEFAULTS,**config})
    out=ROOT/'artifacts/training';best=out/'best';best.mkdir(parents=True,exist_ok=True)
    np.random.seed(args.seed);mx.random.seed(args.seed)
    started=time.perf_counter();model,tokenizer=load(args.model,tokenizer_config={'trust_remote_code':False})
    train,valid,_=load_dataset(args,tokenizer)
    class Best(TrainingCallback):
        loss=float('inf');step=None;reports=[]
        def on_val_loss_report(self,info):
            self.reports.append({'type':'validation',**info})
            if info['val_loss']<self.loss:
                self.loss=info['val_loss'];self.step=info['iteration']
                mx.save_safetensors(str(best/'adapters.safetensors'),dict(tree_flatten(model.trainable_parameters())))
                print(f'Retained best checkpoint at {self.step} completed steps, loss {self.loss:.6f}',flush=True)
            (out/'metrics.json').write_text(json.dumps(self.reports,indent=2)+'\n')
        def on_train_loss_report(self,info):self.reports.append({'type':'training',**info})
    callback=Best();train_model(args,model,train,valid,callback)
    # Upstream validates before the update: explicitly compare the final 600-step weights too.
    final_loss=evaluate(model,CacheDataset(valid),batch_size=args.batch_size,num_batches=-1,max_seq_length=args.max_seq_length)
    callback.on_val_loss_report({'iteration':args.iters,'val_loss':final_loss,'val_time':None})
    verify_dataset()
    shutil.copy2(ROOT/args.adapter_path/'adapter_config.json',best/'adapter_config.json')
    summary=dict(settings=config,stepsCompleted=args.iters,bestStep=callback.step,bestValidationLoss=callback.loss,
                 elapsedSeconds=time.perf_counter()-started,peakMemoryGB=mx.get_peak_memory()/1e9,
                 dataset=json.loads((ROOT/'data/manifest.json').read_text()),
                 versions={p:importlib.metadata.version(p) for p in ['mlx-lm','mlx','transformers','tokenizers','numpy']})
    (out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['stepsCompleted','bestStep','bestValidationLoss','elapsedSeconds','peakMemoryGB']},indent=2))
if __name__=='__main__':main()
