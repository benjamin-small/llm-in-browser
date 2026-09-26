"""Reproducible local reference evaluation of the actual exported GGUF artifacts.

No judge model or network API. Scores are conservative heuristics, not a human audit.
"""
import argparse
import contextlib
import hashlib
import json
from pathlib import Path
import random
import re
import statistics
import socket
import subprocess
import time
import urllib.error
import urllib.request
from generate_data import SYSTEM, render_request

ROOT=Path(__file__).resolve().parents[1]
def request(path,body=None,port=8790):
    req=urllib.request.Request(f'http://127.0.0.1:{port}/{path}',data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(req,timeout=120))

@contextlib.contextmanager
def server(model,port):
    log=ROOT/'artifacts/evaluation/reference.log';log.parent.mkdir(parents=True,exist_ok=True)
    with log.open('w') as output:
        process=subprocess.Popen([str(ROOT/'.cache/llama-build/bin/llama-server'),'-m',str(model),'--host','127.0.0.1','--port',str(port),'-c','2048','-ngl','99','--no-webui','--jinja'],stdout=output,stderr=subprocess.STDOUT)
        try:
            for _ in range(120):
                if process.poll() is not None:raise RuntimeError('Reference server exited; inspect artifacts/evaluation/reference.log')
                try:
                    health=request('health',port=port)
                    if health.get('status')=='ok' or health.get('status')=='ready':break
                except (OSError,urllib.error.URLError):time.sleep(.5)
            else:raise RuntimeError('Reference startup timed out')
            yield
        finally:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait()

def normalize(s):return re.sub(r'\s+',' ',str(s).lower()).strip()
def contains(answer,value):return bool(re.search(r'(?<!\w)'+re.escape(normalize(value))+r'(?!\w)',normalize(answer)))
def unknown(answer):return bool(re.search(r"\b(do not know|don't know|not know|not (?:provided|available|listed|specified|given|known|included|mentioned)|no (?:information|facts|evidence)|cannot determine|can't determine|unknown|(?:do not|don't) have (?:that|the|any) information|does not (?:mention|provide|include))\b",answer.lower()))
def action_claim(answer):
    clean=re.sub(r'\bno\b[^.!?]*[.!?]?','',answer.lower())
    return bool(re.search(r"\b(i (?:have |will )?(?:sent|send|ordered|order|notified|notify|updated|update)|(?:order|notification|record) (?:has been|was) (?:placed|sent|updated))\b",clean))
def grade(case,answer,evidence,graph):
    category=case['category'];correct=False
    if category=='unknown':correct=unknown(answer)
    elif category=='ambiguous':correct=all(contains(answer,v) for v in ['Morgan Reed','Morgan Hale']) and ('?' in answer or 'clarif' in answer.lower())
    elif category=='unsupported_event':correct=contains(answer,'unsupported') and not action_claim(answer)
    elif category=='event':
        event=case['event'];payload=event['payload'];values=list(payload.values())
        correct=contains(answer,case['expected']) and all(contains(answer,v) for v in values) and not action_claim(answer)
    else:correct=contains(answer,case['expected']) and not unknown(answer)
    # Flag names/numbers not supported by retrieved evidence or the target fact.
    # This cannot detect every invented assertion; manual review remains necessary.
    allowed=' '.join([case['question'],str(case['expected']),*(f['text'] for f in evidence)])
    extras=[]
    for entity in graph['entities']:
        label=entity['label']
        if contains(answer,label) and not contains(allowed,label):extras.append(label)
    for number in re.findall(r'(?<![\w-])\d+(?:[.:]\d+)*(?![\w-])',answer):
        if not contains(allowed,number):extras.append(number)
    if category=='unknown' and not correct:extras.append('answered a missing fact')
    if action_claim(answer):extras.append('claimed action')
    return dict(correct=correct,unsupportedFlags=sorted(set(extras)))

def choose_cases(rows,limit):
    result=[]
    for category in sorted({r['category'] for r in rows}):
        subset=[r for r in rows if r['category']==category];random.Random(730).shuffle(subset)
        result+=subset[:limit] if category in ['familiar_wording','held_out_entity','natural_wording','natural_held_out_entity'] else subset
    return result
def main():
    p=argparse.ArgumentParser();p.add_argument('--models',nargs='+',default=['base-q8','tuned-q8','tuned-q4']);p.add_argument('--split',choices=['test','validation'],default='test');p.add_argument('--limit-per-factual-category',type=int,default=60);p.add_argument('--port',type=int,default=0);args=p.parse_args()
    with socket.socket() as available:
        available.bind(('127.0.0.1', args.port));args.port=available.getsockname()[1]
    path=ROOT/'data'/('evaluation.json' if args.split=='test' else 'validation-evaluation.json')
    cases=choose_cases(json.loads(path.read_text()),args.limit_per_factual_category)
    graph=json.loads((ROOT/'public/data/station.json').read_text())
    process=subprocess.run([str(ROOT/'crates/station-core/target/debug/station-core'),str(ROOT/'public/data/station.json')],input=''.join(json.dumps({'query':c['question'],'event':c.get('event')})+'\n' for c in cases),capture_output=True,text=True,check=True)
    retrievals=[json.loads(line) for line in process.stdout.splitlines()]
    out=ROOT/'artifacts/evaluation';out.mkdir(parents=True,exist_ok=True)
    summaries=[]
    for model_id in args.models:
        manifest=json.loads((ROOT/'public/models'/model_id/'manifest.json').read_text())
        weights=ROOT/manifest['files']['weights']['path'].lstrip('/')
        with server(weights,args.port):
            for use_retrieval in [False,True]:
                name=model_id+('-retrieval' if use_retrieval else '')
                rows=[]
                for case,result in zip(cases,retrievals):
                    if 'error' in result:raise ValueError(result['error'])
                    evidence=result['facts'] if use_retrieval else []
                    content=render_request(case['question'],evidence,result['notice'],result['ambiguity'])
                    prompt=f'<|im_start|>system\n{SYSTEM}<|im_end|>\n<|im_start|>user\n{content}<|im_end|>\n<|im_start|>assistant\n'
                    templated=request('apply-template',{'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':content}],'add_generation_prompt':True},args.port)['prompt']
                    if prompt!=templated:raise ValueError('Chat template parity failed')
                    ids=request('tokenize',{'content':prompt,'add_special':False,'parse_special':True},args.port)['tokens']
                    if len(ids)>1792:raise ValueError('Evaluation prompt exceeds application context budget')
                    start=time.perf_counter();response=request('completion',{'prompt':prompt,'temperature':0,'seed':42,'n_predict':256,'cache_prompt':False,'return_tokens':True},args.port)
                    answer=response['content'];score=grade(case,answer,evidence,graph)
                    rows.append(dict(case=case,answer=answer,**score,evidence=evidence,prompt=prompt,inputTokens=ids,outputTokens=response.get('tokens'),timings=response.get('timings'),elapsedSeconds=time.perf_counter()-start))
                by_category={}
                for category in sorted({r['case']['category'] for r in rows}):
                    group=[r for r in rows if r['case']['category']==category]
                    by_category[category]=dict(count=len(group),correct=sum(r['correct'] for r in group),accuracy=sum(r['correct'] for r in group)/len(group))
                summary=dict(configuration=name,split=args.split,count=len(rows),categories=by_category,
                             unsupportedFlagRate=sum(bool(r['unsupportedFlags']) for r in rows)/len(rows),
                             medianNativeDecodeTokensPerSecond=statistics.median(r['timings']['predicted_per_second'] for r in rows),artifactBytes=weights.stat().st_size,
                             modelSha256=manifest['files']['weights']['sha256'],synthetic=True,
                             datasetVersion=graph['datasetVersion'],questionsSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                             graphSha256=hashlib.sha256((ROOT/'public/data/station.json').read_bytes()).hexdigest())
                (out/f'{args.split}-{name}.json').write_text(json.dumps(dict(summary=summary,results=rows),indent=2)+'\n')
                summaries.append(summary);print(json.dumps(summary),flush=True)
    (out/f'{args.split}-summary.json').write_text(json.dumps(summaries,indent=2)+'\n')
if __name__=='__main__':main()
