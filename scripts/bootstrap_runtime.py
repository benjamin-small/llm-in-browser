"""Fetch immutable upstream source and official model assets for the runtime gate."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / "runtime-lock.json").read_text())
HASHES = json.loads((ROOT / "runtime-assets.lock.json").read_text())
CACHE = ROOT / ".cache"


def fetch(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        partial = path.with_suffix(path.suffix + ".partial")
        digest = hashlib.sha256()
        with urllib.request.urlopen(url, timeout=120) as response, partial.open("wb") as out:
            while chunk := response.read(4 * 1024 * 1024):
                out.write(chunk)
                digest.update(chunk)
        partial.replace(path)
    else:
        with path.open("rb") as existing:
            digest = hashlib.file_digest(existing, "sha256")
    expected = HASHES[url]
    if digest.hexdigest() != expected:
        raise ValueError(f"Checksum mismatch for {path}; expected {expected}, got {digest.hexdigest()}")
    print(f"Ready: {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)", flush=True)
    return {"url": url, "path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size,
            "sha256": digest.hexdigest()}


def source(repo, revision, name):
    archive = CACHE / "downloads" / f"{name}-{revision}.tar.gz"
    entry = fetch(f"https://codeload.github.com/{repo}/tar.gz/{revision}", archive)
    destination = CACHE / name
    if name == "flare" and destination.exists():
        marker = destination / ".source-revision"
        if not marker.exists() or marker.read_text().strip() != revision:
            raise RuntimeError("Flare cache is from a different revision. Preserve/rename .cache/flare and rerun setup:assets.")
    if not destination.exists():
        staging = CACHE / f"{name}-extract"
        staging.mkdir(exist_ok=True)
        with tarfile.open(archive) as tar:
            tar.extractall(staging, filter="data")
        extracted, = staging.iterdir()
        extracted.rename(destination)
        staging.rmdir()
        (destination / ".source-revision").write_text(revision + "\n")
    return entry


def main():
    tasks = [
        lambda: source("sauravpanda/flarellm", LOCK["flare"], "flare"),
        lambda: source("ggml-org/llama.cpp", LOCK["llama_cpp"], "llama.cpp"),
        lambda: fetch(f"https://huggingface.co/{LOCK['gguf_repository']}/resolve/{LOCK['gguf_revision']}/{LOCK['gguf_file']}", CACHE / "models" / LOCK["gguf_file"]),
    ]
    for name in ("tokenizer.json", "tokenizer_config.json", "config.json", "generation_config.json"):
        tasks.append(lambda name=name: fetch(f"https://huggingface.co/{LOCK['model']}/resolve/{LOCK['model_revision']}/{name}", CACHE / "models" / name))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        entries = list(pool.map(lambda task: task(), tasks))
    (CACHE / "assets.json").write_text(json.dumps(entries, indent=2) + "\n")


if __name__ == "__main__":
    main()
