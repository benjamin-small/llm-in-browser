# Flare / SmolLM2 runtime proof

**Historical report — the blocker described below was subsequently repaired.** See [the repair findings](flare-repair.md) for the current passing browser results and reproducible patch. The original measurements below are preserved unchanged.

Date: September 8, 2026. **Required gate: FAIL.**

The official SmolLM2-360M-Instruct Q8_0 artifact generates correct answers through a local llama.cpp reference. The pinned Flare browser runtime produces incorrect outputs on the same prompts. Correct tokenization and successful GPU initialization do not resolve the error.

## Environment and artifacts

- Apple M5 Max, 128 GB memory; headed installed Chrome 152 on macOS.
- Rust 1.95.0; WASM SIMD enabled; Flare `a8cb07cf54fa43c4e41664316498ed195fa7b018` plus a documentation-only binding-generation fix.
- llama.cpp reference `f3f1a8f2760f28325a5ec20c05b171e5b7c83a29`, Metal acceleration, 2,048-token context.
- Official HuggingFaceTB GGUF revision `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`; 386,404,992 bytes; SHA-256 `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`.
- Original tokenizer revision `a10cc1512eabd3dde888204e902eca88bddb4951`; greedy decoding with a 32-token output limit.

## Measured results

| Check | Result |
| --- | --- |
| Rust-to-WASM release build | Pass |
| Generated JavaScript syntax, unmodified upstream | Fail: nested documentation comment |
| Generated JavaScript syntax, recorded documentation fix | Pass |
| Embedded GGUF tokenizer vs reference | 0/3 prompts match |
| FlareTokenizer with original tokenizer.json vs reference | 3/3 prompts match |
| Chat template vs reference | 3/3 prompts match |
| GPU initialized with resident weights and KV cache | Yes |
| GPU output, regular and healed prefill | 0/3 correct; repeated token ID 0 |
| GPU first-step logits | All 49,152 values are exactly zero on all three prompts |
| CPU/WASM output, regular and healed prefill | 0/3 correct; nonzero logits but incorrect text |
| GPU with reference-supplied token IDs and healed prefill | Still all-zero logits and repeated token ID 0 |

The GPU diagnostic reports `backend: webgpu`, `has_gpu_weights: true`, `has_gpu_kv_cache: true`, and `has_raw_weights: true`. The harness invokes `next_token_async()`. A capability flag or a tokens-per-second measurement alone would have incorrectly suggested that this runtime was working.

| Prompt | llama.cpp reference | Flare CPU, healed prefill | Flare WebGPU |
| --- | --- | --- | --- |
| Capital of France | The capital of France is Paris. | The answer: | `<\|endoftext\|>` repeated 32 times |
| Aster's director, with Mira Vale supplied in the prompt | The director of Aster is Mira Vale. | The director of the 200000000000000000000000000 | `<\|endoftext\|>` repeated 32 times |
| Complete one, two, three | one, two, three, four | The user will you are you are a chatbot… | `<\|endoftext\|>` repeated 32 times |

## Isolation and implementation findings

1. The binding-generation error is fixed reproducibly by changing one Rust doc example. No numerical code was changed.
2. Loading the original tokenizer JSON resolves tokenization on the three test prompts. The embedded GGUF tokenizer is unsuitable here. Broader Unicode/contraction tokenization parity has not been established.
3. The normal async prefill evaluates the entire prompt, then evaluates its last token again at the next position. The existing `begin_stream_healed_with_params()` avoids that duplicate step. Testing this existing path still leaves both CPU and GPU output incorrect.
4. Supplying the exact reference token IDs proves the GPU all-zero-logit problem persists independently of tokenization. The precise numerical root cause remains unresolved.
5. A possible separate CPU issue to investigate is rotary-position layout: Flare's CPU and WGSL implementations rotate split halves, while the llama.cpp Llama GGUF conversion permutes Q/K rows. This is a source-level lead, not a confirmed repair.

## Consequence

The plan explicitly requires reporting a reproducible blocker before expanding the application when Flare cannot generate correct browser GPU output. Accordingly, the graph, full UI, model training, and four-way quality evaluation are not implemented. No trained artifact or successful 90% accuracy result is claimed.

Browser timings are included in the raw results for diagnostics, but invalid outputs must not be treated as useful inference-throughput benchmarks. General-purpose quality, unknown-answer behavior, cancellation, offline app operation, and GPU memory use have not passed acceptance tests.

Reproduce with `npm run proof`; it exits nonzero on failed correctness. See [README](../README.md) for setup and the reference-token isolation command. Complete recorded results are in [runtime-proof.json](runtime-proof.json).
