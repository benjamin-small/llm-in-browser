import subprocess
from pathlib import Path

root=Path(__file__).resolve().parents[1]
subprocess.run(['cmake','-S','.cache/llama.cpp','-B','.cache/llama-build',
                '-DCMAKE_BUILD_TYPE=Release','-DGGML_METAL=ON','-DLLAMA_CURL=OFF',
                '-DLLAMA_BUILD_TESTS=OFF','-DLLAMA_BUILD_EXAMPLES=ON',
                '-DLLAMA_BUILD_SERVER=ON'],cwd=root,check=True)
subprocess.run(['cmake','--build','.cache/llama-build','--config','Release',
                '--target','llama-server','llama-cli','llama-quantize','-j','12'],cwd=root,check=True)
