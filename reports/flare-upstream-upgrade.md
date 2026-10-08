# Flare upstream alignment · October 8, 2026

Updated Flare from `a8cb07cf54fa43c4e41664316498ed195fa7b018` to upstream main at `b810a0362b757bf08015e194974175be4bc90ac9` (October 6). The downloaded source archive is checksum-pinned in `runtime-assets.lock.json`. This is an exact source commit, not an assertion of a new stable upstream release.

## Patch scope

Upstream now supplies the repairs tracked in #518 (streaming prompt position), #526 (Llama Q/K rotary layout), #527 (WebGPU limits/validation), #528 (generated JavaScript comment), and #530 (tokenizer pre-tokenization). The active local patch shrank from seven files/503 lines to two files/105 lines. A byte comparison against the pristine upstream archive confirms only `flare-loader/src/weights.rs` and `flare-loader/src/gguf.rs` differ.

Issue [#529](https://github.com/sauravpanda/flarellm/issues/529) remains open. The retained WASM-only compatibility workaround expands Q4_0 blocks to Q8_0 before CPU warmup/prefill and GPU upload. It preserves scales and signed values; it is not a native Q4 CPU kernel or a promise of low runtime memory. Native loading remains unchanged. Historical patches remain in Git history.

The source cache now records its revision; setup/build reject an absent or mismatched marker rather than silently reusing an older source tree. Per-file hashes still reject unknown edits and support idempotent patch application. The prior source tree was preserved locally for rollback.

## Verification

- Upstream core and loader suites: 601 tests passed across unit, integration and documentation tests; three documentation tests ignored.
- Q4 regression tests cover signed nibble ordering, positive/negative f16 scale preservation and malformed blocks.
- Compiled WASM tokenizer/retrieval/template parity: 698 evaluation prompts, 119,802 token IDs, plus 47 original-tokenizer fixtures.
- Real desktop Chromium: eight CPU and eight WebGPU cases all matched native llama.cpp output tokens, tokenizer IDs and templates exactly. See [structured results](flare-upstream-browser.json).
- Tuned Q4: director question returns “Mira Vale.” on both CPU and WebGPU, with GPU decoding independently verified. Observable WASM heap was 1,719 MB, excluding GPU/JavaScript; this is one run, not a memory benchmark.
- Application checks: seven TypeScript tests, four dataset tests, three Rust tests; TypeScript check and production builds passed.
- Pages artifact hashes, portable manifest paths and deferred model caching checks passed.

These are runtime regression checks. The model weights, training data and previous synthetic quality evaluation are unchanged; no retraining or new broad quality benchmark is claimed. Async generation is still required for browser WebGPU. Desktop/low-memory restrictions remain in place.

## Distribution and rollback

`demo-v0.2.0` bundles the rebuilt runtime with unchanged tuned model weights and refreshed runtime provenance. Release installation verifies archive/member hashes and source inputs including the runtime pin. The prior `demo-v0.1.0` release and Git history remain available for rollback. Pages deploys from `main` only after the new release is uploaded.

Jev review was unavailable: automatic approval review rejected sending the unpublished patch to an external inference service. No request was dispatched; source inspection and deterministic/browser checks were completed locally instead.
