# Local training and evaluation

The pipeline uses MLX-LM on Apple Silicon; no training examples or prompts are sent to a service. Downloading pinned source/model files and installing dependencies are separate setup steps. The installed Python dependency set is frozen in `training/requirements.lock.txt` (tested with Python 3.14 on this Mac).

```sh
npm run setup:training
npm run data:generate
.venv/bin/python scripts/audit_training.py
npm run train
npm run export
python3 scripts/evaluate.py --split validation
python3 scripts/evaluate.py --split test
npm run build
```

`download_training_model.py` downloads the immutable model revision from `runtime-lock.json`, uses resumable ranges, and verifies the complete Safetensors SHA-256. It keeps complete ranges so interrupted downloads can resume. The original tokenizer JSON, tokenizer configuration, architecture configuration, and generation configuration come from the same pinned revision.

## Data boundaries

`generate_data.py` creates 100 fictional entities and 500 facts, then assigns entity and wording families before generating paraphrases. Version 1.2 has 13,641 training examples, 950 validation examples, and 165 training-format test examples. The separate evaluation question sets also include unknown facts, ambiguous names, and fresh event payloads. `question_forms.py` assigns natural wording to train, validation and test families, including aliases and lower-case labels.

`ground_training.py` supplies examples with the actual Rust retrieval output. Its training graph excludes all test/validation entities and every incident fact; its validation graph excludes test entities. This prevents relationship traversal from leaking held-out entity facts. Familiar-fact evaluation uses unseen wording; the held-out-entity category tests facts not present in training. Recall-only examples are included as well as grounded answers, short follow-ups, uncertainty, ambiguous names and unsupported events. Version 1.1 also withholds requested facts from otherwise relevant evidence and varies missing property types, so the model must distinguish a related fact from an answer.

`test_data.py` checks entity isolation and exact question/payload separation. `audit_training.py` uses the installed MLX tokenizer/dataset code to verify completion-only loss masking and lengths. The audit and dataset manifest contain hashes, counts and maximum lengths. Regenerate data before training, not while a run is in progress.

## Training and selection

The settings in `training/config.json` are rank 16, learning rate `1e-4`, batch size 4, a 1,024-token maximum, and 600 updates. LoRA is applied to the last 16 layers using MLX-LM's Llama adapter defaults; scale is 20 and dropout is zero. Seed is 730. Prompt masking excludes all tokens before the final assistant completion.

Validation runs over every complete batch approximately every 100 steps (948 of 950 examples; MLX's batcher drops the last incomplete batch). The callback saves the actual weights at each new lowest validation loss. MLX validates before a scheduled update, so checkpoint iteration numbers such as 99/199 are intentional. The script also validates the final 600-update weights. The best adapter is in `artifacts/training/best/`, all periodic checkpoints in `artifacts/training/checkpoints/`, and losses/settings/versions in `artifacts/training/`. Training refuses incomplete grounding or changed data hashes. An early run started before grounding finished; it was discarded, marked invalid and never exported.

`export_model.py` fuses the retained adapter, restores original tokenizer/configuration files, then converts with the pinned llama.cpp checkout and native quantizer to Q8_0 and Q4_0. The app manifests and portable bundles include file hashes, source revisions, dataset hashes, settings and validation provenance. Portable bundles are in `artifacts/bundles/`; select `manifest.json` and every listed file together in the app. Export alone does not change the default model.

The browser patch expands Q4_0 blocks to Q8_0 storage, preserving each f16 scale and signed quantized value exactly. Flare's CPU warmup/prefill can then consume those blocks without allocating full float layer weights. GPU decoding uses the same expanded blocks. The exported GGUF remains Q4_0 and native evaluation is unchanged; this compatibility step reduces the download, not memory in proportion to quantization.

After browser validation, record the observed cases and `runtimePassed` status for each tuned artifact in `reports/browser-tuned.json`, then run `python3 scripts/select_model.py`, `python3 scripts/report.py`, and `npm run build`. Selection checks the separate validation scores and browser status before changing the registry default. The current report documents exactly which browser checks were performed; it does not imply that all native evaluation questions were repeated in the browser.

## Evaluation interpretation

The same question list and Rust retrieval implementation are used for base, base+retrieval, tuned, and tuned+retrieval runs. The instruction is held constant when retrieval is removed. This tests the application's grounded-answer policy, not unconstrained pretrained trivia performance. Q8 and Q4 tuned artifacts are both measured to assess quantization loss. Validation is separate from the final held-out report and controls default selection.

`evaluate.py` loads the **actual GGUF artifacts** in a native llama.cpp reference on a free loopback port, formats the original chat template, verifies template parity and token budgets, and uses greedy decoding. It stores every prompt, answer, input/output token sequence, timing and evidence list. Browser runtime/parity checks complement this; native Metal speed must not be presented as browser WebGPU speed.

Factual scoring uses whole-value matches, avoiding mistakes such as counting “1” inside “17.” Unknown-answer and event checks are conservative text heuristics. Unsupported flags identify unexpected names/numbers, answers to missing facts, and claimed actions; they are **not a complete hallucination detector**. Scores may under-credit valid paraphrases or miss other errors. The graph and wording are synthetic and narrow; even a high score does not establish general conversational ability or quality on a future real knowledge graph. Inspect raw outputs and collect real questions before expanding the scope.

Acceptance targets are 90% factual correctness and 90% appropriate unknown-answer handling in the combined configuration. Report measured outcomes even when targets are missed. Prefer Q4 only when its factual score is within two percentage points of Q8 and the combined model passes validation; otherwise use Q8 if it passes. A failing tuned validation must not silently become the default.
