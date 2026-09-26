"""Configurable IPv4 app server; reference/report operations stay loopback-only."""
import argparse
import http.server
import ipaddress
import json
from pathlib import Path
import urllib.request
import urllib.error
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    'WASM runtime': ('.cache/flare-pkg/flare_web_bg.wasm', 'npm run proof:build'),
    'Runtime JavaScript': ('.cache/flare-pkg/flare_web.js', 'npm run proof:build'),
    'SmolLM2 Q8 weights': ('.cache/models/smollm2-360m-instruct-q8_0.gguf', 'npm run setup:assets'),
    'Original tokenizer': ('.cache/models/tokenizer.json', 'npm run setup:assets'),
}


def lan_files():
    """Only the built site and exact files named by its bundled model manifests."""
    dist = ROOT / 'dist'
    files = {'/' + str(p.relative_to(dist)): p for p in dist.rglob('*')
             if p.is_file() and p.resolve().is_relative_to(dist.resolve())}
    files['/'] = dist / 'index.html'
    registry = json.loads((dist / 'models/registry.json').read_text())
    for model in registry['models']:
        manifest = json.loads(files[model['manifest']].read_text())
        for role in ('weights', 'tokenizer', 'tokenizerConfig', 'config', 'generationConfig'):
            path = manifest['files'][role]['path']
            asset = (ROOT / path.lstrip('/')).resolve()
            allowed = any(asset.is_relative_to((ROOT / prefix).resolve())
                          for prefix in ('.cache/models', 'artifacts/models'))
            if not path.startswith('/') or not allowed or not asset.is_file():
                raise ValueError(f'Invalid site model asset: {path}')
            files[path] = asset
    return files


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if not self.path.startswith(('/runtime-proof/', '/.cache/')):
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()

    def translate_path(self, path):
        requested = urlsplit(path).path
        if not ipaddress.ip_address(self.client_address[0]).is_loopback:
            return str(self.server.lan_files.get(unquote(requested), ROOT / 'dist/__not_found__'))
        if requested == '/':
            return str(ROOT / 'dist/index.html')
        prefixes = ('/runtime-proof/', '/.cache/models/', '/.cache/flare-pkg/', '/artifacts/models/', '/artifacts/bundles/', '/reports/')
        for prefix in prefixes:
            if requested.startswith(prefix):
                resolved = Path(super().translate_path(path)).resolve()
                allowed = (ROOT / prefix.lstrip('/')).resolve()
                if resolved.is_dir():
                    resolved = resolved / 'index.html'
                if resolved.is_relative_to(allowed) and resolved.is_file():
                    return str(resolved)
                return str(ROOT / 'dist/__not_found__')
        # Only serve compiled app assets; never expose training data or project files.
        resolved = (ROOT / 'dist' / requested.lstrip('/')).resolve()
        if not resolved.is_relative_to(ROOT / 'dist'):
            return str(ROOT / 'dist/__not_found__')
        return str(resolved)

    def json_response(self, data, status=200):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlsplit(self.path).path
        if not ipaddress.ip_address(self.client_address[0]).is_loopback:
            if unquote(path) not in self.server.lan_files:
                self.send_error(404)
                return
        if path == '/api/status':
            assets = [{'name': name, 'ready': (ROOT / file).is_file(), 'command': command}
                      for name, (file, command) in ASSETS.items()]
            reference_ready = False
            try:
                with urllib.request.urlopen('http://127.0.0.1:8788/health', timeout=2) as response:
                    reference_ready = response.status == 200
            except (OSError, urllib.error.URLError):
                pass
            self.json_response({'assets': assets, 'referenceReady': reference_ready,
                                'ready': all(a['ready'] for a in assets) and reference_ready})
            return
        super().do_GET()

    def do_POST(self):
        if not ipaddress.ip_address(self.client_address[0]).is_loopback:
            self.json_response({'error': 'Runtime diagnostics and report writes are available only on the hosting computer. Browser chat uses no server POST requests.'}, 403)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 2_000_000:
                self.json_response({'error': 'Expected a JSON request under 2 MB.'}, 400)
                return
            body = self.rfile.read(size)
            if self.path == '/report':
                data = json.loads(body)
                name = f"{data['requestedBackend']}-{data['mode']}-{data.get('tokenizerMode','embedded')}"
                if data['requestedBackend'] not in {'cpu','gpu'} or data['mode'] not in {'async','healed'} or data.get('tokenizerMode','embedded') not in {'embedded','external','reference'}:
                    raise ValueError('Invalid report name')
                out = ROOT / 'artifacts' / 'runtime-proof'
                out.mkdir(parents=True, exist_ok=True)
                (out / f'{name}.json').write_text(json.dumps(data, indent=2)+'\n')
                payload = b'{"saved":true}'
            elif self.path in {'/reference/tokenize','/reference/apply-template','/reference/completion'}:
                req = urllib.request.Request('http://127.0.0.1:8788/'+self.path.rsplit('/',1)[1],data=body,headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(req,timeout=120) as response:
                    payload = response.read()
            else:
                self.send_error(404); return
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.end_headers()
            self.wfile.write(payload)
        except (OSError, urllib.error.URLError) as e:
            self.json_response({'error': 'The local reference server is unavailable. '
                                'Start both servers with npm run dev, then retry.', 'detail': str(e)}, 503)
        except (ValueError, KeyError, TypeError) as e:
            self.json_response({'error': str(e)}, 400)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', type=ipaddress.IPv4Address, default=ipaddress.IPv4Address('127.0.0.1'))
    args = parser.parse_args()
    print(f'App server listening on {args.host}:8787', flush=True)
    server = http.server.ThreadingHTTPServer((str(args.host),8787), Handler)
    server.lan_files = {} if args.host.is_loopback else lan_files()
    server.serve_forever()
