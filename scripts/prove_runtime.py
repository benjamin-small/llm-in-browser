"""Run local reference and browser proofs, owning and cleaning up both servers."""
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/runtime-proof'
OUT.mkdir(parents=True, exist_ok=True)
processes = []
logs = []
failed = False


def start(command, name):
    log = (OUT / f'{name}.log').open('w')
    logs.append(log)
    p = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    processes.append(p)
    return p


def wait_for(url, p):
    for _ in range(120):
        if p.poll() is not None:
            raise RuntimeError('Test server exited; inspect artifacts/runtime-proof/*.log')
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise TimeoutError(url)


try:
    web = start([sys.executable, 'scripts/serve_proof.py'], 'web-server')
    reference = start([str(ROOT / '.cache/llama-build/bin/llama-server'), '-m',
                       '.cache/models/smollm2-360m-instruct-q8_0.gguf', '--host',
                       '127.0.0.1', '--port', '8788', '-c', '2048', '-ngl', '99',
                       '--jinja', '--no-webui'], 'reference-server')
    wait_for('http://127.0.0.1:8787/runtime-proof/', web)
    wait_for('http://127.0.0.1:8788/health', reference)
    cases = [tuple(sys.argv[1:4])] if len(sys.argv) == 4 else [
        ('gpu', 'async','external'), ('cpu', 'async','external'),
        ('gpu', 'healed','external'), ('cpu', 'healed','external')]
    for backend, mode, tokenizer_mode in cases:
        print(f'Running {backend}/{mode}/{tokenizer_mode}', flush=True)
        name=f'{backend}-{mode}-{tokenizer_mode}'
        with (OUT / f'{name}-runner.log').open('w') as log:
            p = subprocess.run(['node', 'scripts/run_browser_proof.mjs', backend, mode,tokenizer_mode],
                               cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=330)
        failed = failed or p.returncode != 0
        report = OUT / f'{name}.json'
        if report.exists():
            data = json.loads(report.read_text())
            print(json.dumps({'backend': backend, 'mode': mode, 'kind': data['kind'],
                              'message': data.get('message'), 'gatePassed':data.get('gatePassed'), 'cases': [
                                  {k: c.get(k) for k in ['tokenizerMatches','templateMatches','referenceText','output','firstLogits','smokePassed']}
                                  for c in data.get('cases', [])]}), flush=True)
        else:
            print(f'Runner exit {p.returncode}; inspect {backend}-{mode}-runner.log', flush=True)
finally:
    for p in processes:
        if p.poll() is None:
            p.terminate()
    for p in processes:
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            p.kill(); p.wait()
    for log in logs:
        log.close()
sys.exit(1 if failed else 0)
