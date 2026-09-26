# Local browser POC comparison

The selected tuned-q4 model with Rust retrieval scored **204/206 factual answers, 25/25 appropriate unknown answers and 15/18 event responses**. These are narrow synthetic results, not a general capability claim.

## Held-out comparison

| Configuration | Record-style familiar | Record-style held-out | Natural familiar | Natural held-out | Unknown facts | Events | Unsupported flags | Weights |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| base-q8 | 0/60 (0%) | 1/43 (2%) | 1/60 (2%) | 4/43 (9%) | 9/25 (36%) | 5/18 (28%) | 25.9% | 386.4 MB |
| base-q8-retrieval | 51/60 (85%) | 36/43 (84%) | 50/60 (83%) | 35/43 (81%) | 1/25 (4%) | 1/18 (6%) | 13.1% | 386.4 MB |
| tuned-q8 | 6/60 (10%) | 4/43 (9%) | 7/60 (12%) | 9/43 (21%) | 25/25 (100%) | 13/18 (72%) | 24.7% | 386.4 MB |
| tuned-q8-retrieval | 60/60 (100%) | 43/43 (100%) | 59/60 (98%) | 42/43 (98%) | 25/25 (100%) | 17/18 (94%) | 0.0% | 386.4 MB |
| tuned-q4 | 0/60 (0%) | 2/43 (5%) | 3/60 (5%) | 2/43 (5%) | 25/25 (100%) | 15/18 (83%) | 11.6% | 229.1 MB |
| tuned-q4-retrieval | 60/60 (100%) | 43/43 (100%) | 59/60 (98%) | 42/43 (98%) | 25/25 (100%) | 15/18 (83%) | 0.0% | 229.1 MB |

Every configuration uses the same 251 questions and grounded-answer instruction. Disabling retrieval leaves that instruction unchanged; the tuned model generally abstains rather than relying on memorization. This is an application ablation, not a neutral test of unconstrained closed-book recall. Ambiguity and unsupported events each have only one example.

Unsupported assertion flags are automated indicators for unmatched names/numbers, answering missing facts and claimed actions. Zero flags is not proof of zero hallucinations. Exact-value grading can miss contradictions or under-credit paraphrases. Raw outputs are retained for review.

## Validation and quantization

Selection used separate factual and unknown-answer validation plus browser runtime checks bound to each exact model and patch hash. Q8 factual validation was 100.00%; Q4 was 100.00%. Their difference is 0.00 percentage points, against the agreed two-point quantization limit. Selected default: tuned-q4. Test scores did not control selection.

Q4_0 is the pinned llama.cpp standard recipe: layer matrices are Q4_0, while the tied embedding/output matrix falls back to Q8_0 because its width is incompatible with the preferred embedding quantizer. Norm weights are F32. These actual exported files were evaluated.

In the browser, the compatibility patch expands Q4_0 blocks losslessly into Q8_0 storage for Flare’s CPU prefill and GPU decoding. Scales and decoded values are unchanged. This avoids the original empty-float-weight panic, but Q4’s smaller download does not deliver a proportional runtime memory saving.

## Training

Dataset aster-1.2.0 contains 13,641 training chats, 950 validation chats and 165 training-format test chats. The graph has 100 entities and 500 facts. Training and validation retrieval exclude held-out test entities; training also excludes validation entities and incident relationships. Familiar wording templates and event payloads are separated before expansion.

A fresh 600-update MLX-LM LoRA run used rank 16, learning rate 1e-4, batch 4, sequence cap 1,024 and prompt masking. It took 118.7 seconds with 3.41 GB peak MLX memory. The lowest validation loss was 0.003136 at 499 completed updates; those weights were fused. Validation uses every complete batch (948/950 examples). The maximum audited example length is 405 tokens.

The first experiment reached excellent factual validation but 0/8 unknown-answer correctness. Version 1.1 added missing-property diversity and examples where the requested fact is deliberately removed from otherwise relevant evidence. The first experiment remains in `artifacts/round-1/`. Version 1.2 addresses a further gap found in the actual app: v1.1 passed record-style questions but abstained on ordinary wording such as “Where is the oxygen sensor?” Version 1.2 adds natural forms, lower-case labels, aliases and follow-ups. Natural train/validation/test wording families were assigned before expansion. Earlier record-style test outputs had already been inspected; those scores should be treated as a fixed regression set. The natural subset adds fresh reserved wording. No final-test questions were added to training. Round 2 artifacts remain in `artifacts/round-2/`.

## Runtime and performance

Browser inference uses patched Flare in a dedicated worker; Rust retrieval is a separate WASM module. The original tokenizer/template configuration is preserved. CPU prefill precedes asynchronous WebGPU decoding. The repaired base runtime matched reference tokens/text on eight deterministic prompts in all four CPU/GPU and regular/healed combinations. Tuned-browser checks and observed timings are in [browser-tuned.json](browser-tuned.json); broader UI, recovery and offline checks are in [browser-integration.md](browser-integration.md).

The expanded check found that Flare ignored the external JSON pre-tokenizer, changing token boundaries around blank lines and digits. The patch now implements the selected model’s Digits + ByteLevel pipeline. Actual compiled WASM matches native Rust retrieval, the original chat template and all 119,802 reference token IDs across 698 prompts; 47 additional fixtures match the original Hugging Face tokenizer. This is library-level parity, separately complemented by real-browser GPU generation. See [tokenizer-parity.json](tokenizer-parity.json).

Native llama.cpp performs the quality evaluation against the actual GGUF artifacts, using greedy decoding, the original template and the same Rust retrieval output. Its throughput is recorded in the raw results and must not be described as browser WebGPU speed. Browser timing depends on prompt length, warmup, foreground/background scheduling and other GPU use. Model parsing and cache verification are excluded from per-turn timings.

Comparable browser observations below used “What room contains Nico?” with 278 input and six output tokens. These are single runs, not a latency distribution.

| Model | First token | Decode | WASM heap |
|---|---:|---:|---:|
| tuned-q4 | 3.68 s | 16.8 tokens/s | 1,891 MB |
| tuned-q8 | 3.66 s | 17.0 tokens/s | 2,013 MB |

Observable memory is the Flare WASM heap, not total browser or GPU memory. A base Q8 sample used a 2,013 MB WASM heap. Although weights are small, this prototype is not a sub-gigabyte browser process: Flare allocates a larger internal KV capacity than the app’s 2,048-token budget. This remains a useful optimization target.

## Scope and limits

The corpus is fictional, the answers are short and templated, and the graph covers a narrow domain. Held-out entities test retrieval and copying more than open-ended reasoning. General chat, real-world knowledge, adversarial robustness, other model architectures, mobile browsers and hardware without WebGPU have not been established by this result. Unavailable-GPU branches were unit-tested and actual CPU generation was verified; this Mac has a working GPU.

The natural-language misses were two room-owner questions phrased “Whose responsibility is …?” Event failures included an unsupported interpretation of an alert (Q8), abstention on visitor messages (Q4), and substitution of persistent stock for the temporary event count (Q4). Events only produce text and never execute actions, but their correctness remains a concrete improvement target. The agreed 90% acceptance thresholds apply to factual and unknown-answer questions; no 90% event claim is made.

Prompts and graphs remain local. The browser works after network-disabled reload, and an observed event generated no page requests. Source review constrains worker file reads to the same origin; the page request trace alone does not cover every worker-internal request. No site was deployed and the upstream issue draft was not posted.

## Reproducible artifacts

- [Training guide](../docs/training.md), [graph schema and examples](../docs/graph-format.md), [data audit](training-data-audit.json).
- Raw questions, predictions, evidence, token IDs and native timings: `artifacts/evaluation/test-*.json` and `validation-*.json`.
- Training configuration, losses, best/periodic adapters and fused weights: `artifacts/training/`.
- Portable manifests, original tokenizer/configuration and weights: `artifacts/bundles/tuned-q8/` and `tuned-q4/`.
- [Default selection evidence](model-selection.json).
