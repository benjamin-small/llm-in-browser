"""Give training examples the same Rust retrieval context as the browser.

Restrict the training graph before retrieval so traversal cannot leak held-out entities.
"""
import json
from pathlib import Path
import re
import subprocess
import tempfile
from generate_data import render_request
ROOT=Path(__file__).resolve().parents[1]
def main():
    graph=json.loads((ROOT/'public/data/station.json').read_text());manifest=json.loads((ROOT/'data/manifest.json').read_text())
    facts={f['id']:f for f in graph['facts']}
    for split in ['train','valid','test']:
        blocked=set(manifest['heldOutTestEntities']) if split=='valid' else set(manifest['heldOutTestEntities']+manifest['heldOutValidationEntities']) if split=='train' else set()
        restricted={**graph,'entities':[e for e in graph['entities'] if e['id'] not in blocked], 'facts':[f for f in graph['facts'] if f['subject'] not in blocked and f['object'] not in blocked]}
        rows=[json.loads(line) for line in (ROOT/f'data/{split}.jsonl').read_text().splitlines()]
        grounded=[r for r in rows if r['messages'][-2]['content'].startswith('Evidence:\n')]
        queries=[]
        for row in grounded:
            content=row['messages'][-2]['content'];question=content.split('\n\nRequest: ',1)[1]
            ids=re.findall(r'\[([^\]]+)\]',content.split('\n\nRequest: ',1)[0]);previous=list(dict.fromkeys(facts[id]['subject'] for id in ids if id in facts))[:1]
            event=json.loads(question.split('Respond to this event: ',1)[1]) if question.startswith('Respond to this event: ') else None
            queries.append(dict(query=question,previous=previous,event=event))
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'graph.json';path.write_text(json.dumps(restricted))
            output=subprocess.run([str(ROOT/'crates/station-core/target/debug/station-core'),str(path)],input=''.join(json.dumps(q)+'\n' for q in queries),text=True,capture_output=True,check=True).stdout
        for row,query,line in zip(grounded,queries,output.splitlines(),strict=True):
            result=json.loads(line)
            if 'error' in result:raise ValueError(result['error'])
            withheld=set(row.get('withholdFactIds',[]))
            if withheld:result['facts']=[f for f in result['facts'] if f['id'] not in withheld]
            row['messages'][-2]['content']=render_request(query['query'],result['facts'],result['notice'],result['ambiguity'])
        (ROOT/f'data/{split}.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
        print(f'{split}: {len(grounded)} examples grounded through Rust retrieval',flush=True)
    import hashlib
    manifest['grounding']='Rust station-core; training traversal excludes validation/test entities; validation traversal excludes test entities'
    manifest['files']={f'{k}.jsonl':hashlib.sha256((ROOT/f'data/{k}.jsonl').read_bytes()).hexdigest() for k in ['train','valid','test']}
    (ROOT/'data/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__':main()
