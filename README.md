# Aster · Experimental browser LLM

A tiny conversational model running locally in your browser, using **SmolLM2-360M-Instruct, patched Flare, Rust/WASM and WebGPU**. A separate Rust/WASM module retrieves evidence from a fictional research-station knowledge graph.

**[Try the live demo](https://benjamin-small.github.io/llm-in-browser/)** · [Runtime repairs](reports/flare-repair.md) · [Training and evaluation](docs/training.md)

> **You:** Who is the director of Aster?  
> **Aster:** Mira Vale.

The demo also answers questions about rooms, equipment and supplies, and responds to temporary device alerts, visitors and low-stock events. Expand an answer's evidence panel to inspect the supplied facts and performance. All station information is fictional.

## Try it

Open the demo on a desktop and select **Load model**. The model download is approximately 230 MB; loading and CPU prefill can take time. The page itself does not automatically download model weights. Desktop Chrome with WebGPU and at least 8 GB system RAM is recommended. Phones/tablets and browsers reporting 4 GB RAM or less are blocked because loading can crash a tab. Memory reporting is incomplete, so this cannot guarantee enough free memory.

Inference uses a dedicated worker, CPU prefill and asynchronous WebGPU decoding, with CPU fallback when necessary. Q4 weights are expanded to Q8 internally: expect roughly 2 GB WASM memory plus JavaScript/GPU allocations, not just the download size. The performance panel distinguishes GPU availability from verified decoding.

**No inference server or API key.** Initial application/model downloads require networking; questions, imported graphs and inference stay in the browser. Application assets and verified model files are cached for subsequent offline use, subject to browser storage availability/eviction. This is an experimental demo, not a reliable general-purpose assistant.

## Run the published demo locally

Requires Node 26 and Python 3.11 or newer. Prebuilt Rust/WASM and the tuned model are distributed as a checksum-verified GitHub release asset, so this path does not require a Rust or training toolchain.

```sh
git clone https://github.com/benjamin-small/llm-in-browser.git
cd llm-in-browser
npm ci
npm run build:pages
npm run preview
```

Open **http://127.0.0.1:8795/llm-in-browser/**. The first build downloads the release bundle pinned in `pages-assets.lock.json`. Subsequent builds reuse the verified local archive. Run `npm run build:pages` again after changing application code.

## GitHub Pages deployment

The Pages workflow builds and deploys `dist/` on pushes to `main`. Set the repository's Pages source to **GitHub Actions**. The build verifies the release archive, every bundled file and the matching graph/runtime source hashes. Model binaries are kept in a release rather than Git; Pages serves the extracted files from the same origin as the application.

To replace the model/runtime, build and validate it using the guides below, update the release version/URL in `scripts/pages_release.py`, run `npm run pages:pack`, and publish that archive before pushing the updated lockfile. Do not overwrite an existing release asset referenced by a lockfile.

The local runtime proof lab requires its native reference server and is not part of the hosted site. Its recorded results are included in `reports/`. To run the full local diagnostics after source setup, use `npm run dev` and open `http://127.0.0.1:8787/`. That launcher binds all IPv4 interfaces by default; `npm run dev -- --host 127.0.0.1` restricts it to this computer. For remote testing, use HTTPS or an SSH local forward to localhost, which is a browser secure context.

## Build the runtime from source

Tested on Apple Silicon macOS with Rust 1.95, wasm32, wasm-pack, Node 26, Python 3.14 and Apple developer tools. The browser target is desktop Chromium with WebGPU; this app has been exercised in the Codex in-app Chromium browser. Installed-Chrome runtime-gate scripts are also included.

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm run setup:assets
npm run proof:build
npm run proof:reference-build
python3 scripts/package_model.py
cargo fetch --manifest-path crates/station-core/Cargo.toml --locked
npm run data:generate
npm run build
npm run dev
```

Install `wasm-pack`, CMake and Apple command-line developer tools if absent. Source/model revisions are pinned in `runtime-lock.json`; downloaded asset checksums are in `runtime-assets.lock.json`. `proof:build` applies the recorded Flare patch idempotently and refuses unknown source edits. Generated dependencies and weights live in `.cache/` and `artifacts/`. A fresh checkout with only base weights offers the base model until trained artifacts are available.

## Knowledge and training

The fictional graph contains 100 people, teams, rooms, devices, supplies and the station, with 500 facts. [Graph format and events](docs/graph-format.md) explains custom imports and provides missing-fact, ambiguous-name and unsupported-event examples. Events are temporary notifications; no actions are executed and graph facts are not changed.

The [training guide](docs/training.md) covers deterministic dataset generation, split boundaries, local MLX-LM LoRA, best-checkpoint selection, fusion, pinned GGUF export and evaluation. Start with:

```sh
npm run setup:training
npm run data:generate
npm run train
npm run export
python3 scripts/evaluate.py --split validation
python3 scripts/evaluate.py --split test
```

Portable model bundles live in `artifacts/bundles/`. In **Import model bundle**, select `manifest.json` and every listed file together. Files include hashes, the original tokenizer/template configuration, model revision, dataset version and training settings. Q4_0 uses llama.cpp's standard recipe, with Q8_0 for the tied embedding/output matrix. Exporting does not automatically promote an unvalidated model.

The trained Q4 model with retrieval is the validated default, with Q8 and the base model retained for comparison. In the [measured comparison](reports/comparison.md), both tuned variants with retrieval answered 204/206 factual and 25/25 unknown-answer test questions correctly, including ordinary question forms and record-style wording. These are narrow synthetic questions. Q4 matches Q8 on separate factual validation. Event accuracy is weaker: 15/18 for Q4 and 17/18 for Q8. Inspect event responses before relying on them. The browser expands Q4 blocks losslessly to Q8 storage because Flare's CPU prefill lacks a Q4_0 kernel; its smaller download does not translate directly into lower runtime memory.

The context budget is 2,048 tokens with up to 256 output tokens. Older complete conversation turns are removed first, then lower-ranked evidence; an oversized current request is rejected. The actual prompt token count, omitted history, first-token latency, decoding speed and observable WASM heap size are shown for each answer. WASM heap size excludes JavaScript and GPU memory.

## Verification

```sh
npm test
npm run check
cargo clippy --manifest-path crates/station-core/Cargo.toml --offline --all-targets -- -D warnings
npm run build
```

The patched runtime has 564 passing Flare core/loader tests. The original runtime gate has eight deterministic browser/reference comparisons in each CPU/GPU and regular/healed configuration. The expanded [tokenizer and retrieval parity check](reports/tokenizer-parity.json) covers 698 full prompts and 47 original-tokenizer fixtures. Run `.venv/bin/python scripts/tokenizer_fixtures.py` and `node scripts/check_wasm_parity.mjs` after producing evaluation artifacts. See [repair findings](reports/flare-repair.md), [raw repair evidence](reports/flare-repair.json), [app browser checks](reports/browser-integration.md), and the [upstream issue draft](reports/upstream-report-draft.md), with links to the published upstream issues.

To rerun that standalone headed-Chrome gate, stop `npm run dev` first, then run `npm run proof`. It owns ports 8787/8788 temporarily and shuts them down when finished. The embedded GGUF tokenizer remains unsuitable; both the app and the passing proof use the original tokenizer JSON.

Quality is measured on synthetic questions, with familiar facts/unseen wording reported separately from held-out entities. The 90% factual/unknown-answer targets are acceptance thresholds, not assumed capabilities. The native quality evaluator and browser runtime checks measure different things; native Metal speed is not browser WebGPU speed. Inspect evidence and raw outputs before adapting the prototype to a real dataset.

Flare is MIT-licensed; SmolLM2 is from Hugging Face and Apache-2.0-licensed. No runtime replacement was made.

Third-party license texts and the original model card are in [licenses/](licenses/). The bundled model is a fine-tuned derivative of Hugging Face SmolLM2; the Flare patch is included in [patches/](patches/).
