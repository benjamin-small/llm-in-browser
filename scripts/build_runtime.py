import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / 'scripts/patch_flare.py')], check=True)
subprocess.run(['wasm-pack', 'build', 'flare-web', '--target', 'web', '--release',
                '--out-dir', str(root / '.cache/flare-pkg'), '--', '--locked'],
               cwd=root / '.cache/flare', check=True)
subprocess.run(['node', '--check', str(root / '.cache/flare-pkg/flare_web.js')], check=True)
