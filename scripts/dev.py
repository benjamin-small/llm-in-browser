"""Serve the app on IPv4 and keep the local reference running until Ctrl-C."""
import argparse
import ipaddress
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

from serve_proof import ASSETS, ROOT


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', type=ipaddress.IPv4Address, default=ipaddress.IPv4Address('0.0.0.0'),
                        help='Web listener IPv4 address; default: all IPv4 interfaces. Reference remains on localhost.')
    args = parser.parse_args()
    web_host = str(args.host)
    web_probe = '127.0.0.1' if web_host == '0.0.0.0' else web_host
    reference_binary = ROOT / '.cache/llama-build/bin/llama-server'
    missing = [f'{name}: {command}' for name, (file, command) in ASSETS.items()
               if not (ROOT / file).is_file()]
    if not reference_binary.is_file():
        missing.append('Reference runtime: npm run proof:reference-build')
    if not (ROOT / 'dist/index.html').is_file():
        missing.append('Chat application: npm run build')
    if missing:
        print('Local runtime files are missing. Run the following setup commands:\n  ' + '\n  '.join(missing))
        return 1
    for port in (8787, 8788):
        with socket.socket() as sock:
            try:
                sock.bind((web_host if port == 8787 else '127.0.0.1', port))
            except OSError:
                print(f'Port {port} is already in use. If npm run dev is running, open '
                      f'http://{web_probe}:8787/. Otherwise stop the process using that port and retry.')
                return 1

    out = ROOT / 'artifacts/runtime-proof'
    out.mkdir(parents=True, exist_ok=True)
    processes, logs = [], []

    def stop(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        commands = [
            ('dev-web', [sys.executable, 'scripts/serve_proof.py', '--host', web_host]),
            ('dev-reference', [str(reference_binary), '-m',
                               '.cache/models/smollm2-360m-instruct-q8_0.gguf',
                               '--host', '127.0.0.1', '--port', '8788', '-c', '2048',
                               '-ngl', '99', '--jinja', '--no-webui']),
        ]
        for name, command in commands:
            log = (out / f'{name}.log').open('w')
            logs.append(log)
            processes.append(subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT))
        print('Starting the local page and reference model…', flush=True)
        deadline = time.monotonic() + 120
        for port in (8787, 8788):
            host = '127.0.0.1' if port == 8788 else web_probe
            url = f'http://{host}:{port}/' + ('health' if port == 8788 else '')
            while True:
                if any(p.poll() is not None for p in processes):
                    raise RuntimeError('A server exited. Inspect artifacts/runtime-proof/dev-*.log.')
                try:
                    with urllib.request.urlopen(url, timeout=2) as response:
                        if response.status == 200:
                            break
                except (OSError, urllib.error.URLError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('Startup timed out. Inspect artifacts/runtime-proof/dev-*.log.')
                time.sleep(0.5)
        print(f'\nOpen http://{web_probe}:8787/\n'
              f'Web listener: {web_host}:8787. For LAN clients, use this computer’s IPv4 address.\n'
              'Aster local chat is ready. Runtime diagnostics: /runtime-proof/\n'
              'Keep this command running. Press Ctrl-C to stop both servers.\n', flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(0.5)
        raise RuntimeError('A server stopped. Inspect artifacts/runtime-proof/dev-*.log.')
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for log in logs:
            log.close()


if __name__ == '__main__':
    sys.exit(main())
