> October 8 update: upstream has incorporated five repairs; only Q4 compatibility remains patched locally. Historical patch variants referenced below are preserved in Git commit `0205d786667d2f7f43db35c79798ca2d27ded73b`. See [current upgrade report](flare-upstream-upgrade.md).

> Publication update (September 21, 2026): this historical combined draft was split into five upstream bug reports plus a comment on existing #518. See [published report index](upstream-issues-2026-09-21/README.md). Later references below to “unposted” describe the original draft state.

# Draft: SmolLM2-360M GGUF produces incorrect CPU answers and zero WebGPU logits

Local draft; not submitted to GitHub. Intended repository: `sauravpanda/flarellm`.

## Summary

With the official SmolLM2-360M-Instruct Q8_0 GGUF, Flare's browser CPU path produced incorrect answers and its async WebGPU path returned all-zero logits despite reporting resident GPU weights and KV cache. The same weights and prompts produced correct answers in llama.cpp. We isolated three inference/integration problems and one generated-JavaScript build problem. A local patch fixes our reproduction on CPU/WASM and WebGPU.

These findings are specific to the tested model/build/browser. We are not claiming that every Flare model or GPU is affected.

## Versions and environment

- Flare: `a8cb07cf54fa43c4e41664316498ed195fa7b018`, release 0.2.21. GitHub's `refs/heads/main` still pointed to this SHA when checked on September 8, 2026.
- Model: `HuggingFaceTB/SmolLM2-360M-Instruct-GGUF`, revision `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`, `smollm2-360m-instruct-q8_0.gguf`.
- Model file: 386,404,992 bytes; SHA-256 `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`.
- Original tokenizer: `HuggingFaceTB/SmolLM2-360M-Instruct`, revision `a10cc1512eabd3dde888204e902eca88bddb4951`, `tokenizer.json`.
- Reference: llama.cpp `f3f1a8f2760f28325a5ec20c05b171e5b7c83a29` with the same GGUF and greedy decoding.
- Mac: Apple M5 Max, 128 GB RAM. Rust 1.95.0, WASM SIMD, wasm-bindgen 0.2.117. The baseline was reproduced in installed Chrome 152; repaired runs used the Codex in-app Chromium browser reporting Chrome 152.

## Findings

### 1. Llama GGUF Q/K row layout does not match Flare's RoPE

The [Llama GGUF converter](https://github.com/ggml-org/llama.cpp/blob/f3f1a8f2760f28325a5ec20c05b171e5b7c83a29/conversion/llama.py#L176) interleaves Q/K rows for adjacent-pair rotary embeddings. Flare's [CPU rotary implementation](https://github.com/sauravpanda/flarellm/blob/a8cb07cf54fa43c4e41664316498ed195fa7b018/flare-core/src/model.rs#L7256) and GPU batched RoPE rotate split halves. The GGUF weight-loading path did not normalize between these layouts.

Our repair restores split-half row order at Llama GGUF assembly, for both f32 and raw quantized weights and for separate raw-weight attachment. Safetensors and other architectures keep their existing behavior. The model file itself is unchanged.

This changes an incorrect answer such as “The director of the 200000000…” into “The director of Aster is Mira Vale.” on the same supplied-fact prompt, together with position-consistent prefill. Testing the existing healed path before the row-layout repair still produced incorrect answers, so the layout problem is independent of normal-stream duplication.

### 2. Normal streaming processes the final prompt token twice

In [`begin_stream_impl` and `begin_stream_async_impl`](https://github.com/sauravpanda/flarellm/blob/a8cb07cf54fa43c4e41664316498ed195fa7b018/flare-web/src/lib.rs#L1958), prefill consumes all N prompt tokens, sets the next position to N, and leaves the last prompt token as the next input. The first decode call therefore processes that token again at N instead of N−1.

Our repair prefills the first N−1 tokens and processes the last one at N−1 on the first decode step, including the one-token case. The existing healed-prefill API already avoids the duplicate for longer prompts; [issue #234](https://github.com/sauravpanda/flarellm/issues/234) is related prior context. The report should distinguish this normal-stream behavior from true partial-token healing.

### 3. Default WebGPU workgroup-storage limit invalidates attention

The [device request](https://github.com/sauravpanda/flarellm/blob/a8cb07cf54fa43c4e41664316498ed195fa7b018/flare-gpu/src/backend.rs#L258) uses default workgroup-storage limits: 16,384 bytes. The f16 attention shader required 16,416 bytes on our browser, and the adapter advertised 32,768. Capturing a validation error scope exposed:

```text
The total use of workgroup storage (16416 bytes) is larger than the maximum allowed (16384 bytes).
This adapter supports a higher maxComputeWorkgroupStorageSize of 32768,
which can be specified in requiredLimits when calling requestDevice().
While initializing [ComputePipeline "attention_scores_f16"]
```

Without the error scope, `init_gpu()` returned true; `backend_info()` reported WebGPU, GPU weights, and GPU KV cache; all 49,152 first-step logits were zero. Greedy decoding repeatedly selected token ID 0.

Our local repair requests the adapter's supported workgroup-storage limit, checks a minimum covering the attention shader family, and captures validation failures before trusting readback. GPU decoding then produces nonzero logits and correct answers. For an upstream PR, we should agree on the minimum requested limit, behavior on 16 KiB adapters, and structured error propagation. Our diagnostic patch currently panics on a captured validation failure so the worker can surface it; that should not be presented as the final library error API.

### 4. A Rust doc example makes generated JavaScript invalid

The `begin_stream` example includes `/* done */` inside a Rust doc comment. wasm-bindgen 0.2.117 emits that documentation into a JS block comment without protecting the terminator, producing invalid generated JavaScript. Removing the nested comment fixes the build. This is a small compatibility fix, separate from the numerical errors.

## Minimal reproduction outline

1. Build pinned `flare-web` with `wasm-pack build flare-web --target web --release`; remove the nested doc comment above to obtain loadable JS. Verify the generated JS with `node --check`.
2. Serve the generated package, official GGUF, and original `tokenizer.json` over localhost.
3. In a dedicated module worker, run the following using those local asset paths:

```js
import init, { FlareEngine, FlareTokenizer } from './pkg/flare_web.js';
await init();
const tokenizer = FlareTokenizer.from_json(await (await fetch('./tokenizer.json')).text());
const engine = FlareEngine.load(new Uint8Array(
  await (await fetch('./smollm2-360m-instruct-q8_0.gguf')).arrayBuffer()
));
// Omit this line for the CPU comparison.
await engine.init_gpu();
const prompt = engine.apply_chat_template(
  'Facts: The research station is named Aster. Its director is Mira Vale. Who is the director of Aster?',
  'You are a helpful assistant. Answer briefly.'
);
const ids = tokenizer.encode(prompt);
await engine.begin_stream_with_params_async(ids, 32, 0, 1, 0, 1, 0);
const output = [];
let firstLogits;
for (let i = 0; i < 32; i++) {
  const id = await engine.next_token_async();
  if (id === undefined) break;
  if (i === 0) firstLogits = engine.last_logits;
  output.push(id);
}
console.log(engine.backend_info());
console.log({nonzero: firstLogits?.filter(value => value !== 0).length});
console.log(tokenizer.decode(new Uint32Array(output)));
engine.free();
tokenizer.free();
```

4. Compare the exact rendered prompt and token IDs against llama.cpp with temperature 0, 32 output tokens, and the same model. Use the original tokenizer to avoid conflating these failures with the separate embedded-tokenizer discrepancy.
5. Repeat with the existing healed-prefill API to isolate the row-layout/GPU failures from duplicate prompt processing.

## Validation after the local repair

Eight short prompts passed in each of CPU/async, CPU/healed, GPU/async, and GPU/healed: 32 configuration/prompt cases, eight unique prompts. Prompt tokenization, chat template, generated text, and generated token IDs matched the reference. The reference includes terminal EOS in its token list, while Flare signals it with `undefined`; comparison normalizes that convention. First-step logits were nonzero. GPU backend/weight/cache diagnostics were positive.

The prompts include the capital of France, Aster's director, a counting sequence, arithmetic, an equipment room, a supply count, a team lead, and an accented word. These are smoke tests, not a general accuracy benchmark.

252 core and 308 loader unit tests passed, including new row-layout and malformed-shape tests. The local patch also passed clean-source application, result-hash checks, idempotence, and unknown-edit protection.

## Suggested contribution shape

Start with this reproduction issue and offer separate small patches for the loader, streaming positions, GPU limits/error handling, and documentation. Add targeted failing regression tests for each. Before proposing a general merge, test additional Llama GGUF variants/quantizations and less-capable GPU adapters, and replace panic-based GPU diagnostics with the maintainers' preferred error handling.

The original tokenizer JSON is a workaround in the current app harness; the embedded GGUF tokenizer discrepancy remains a separate investigation, not a repaired feature.

Local supporting files, to attach or excerpt only when publishing is authorized:

- `patches/flare-smollm2.patch`
- `reports/flare-repair.json`
- `reports/flare-repair.md`
- `runtime-proof/worker.js`

## Duplicate check

Checked upstream main and searched issue titles/bodies for RoPE, permutation, workgroup storage, the workgroup-limit field, final-token handling, and block comments. No exact match was found for the layout, storage-limit, or comment problems. Issue #234 is related to final-token handling; issues #507 and #510 cover prefill refactoring/performance rather than these numerical failures. No open PRs were returned at the time of checking. Search is not proof that no related discussion exists.

## Additional Q4_0 browser loader finding

While testing a locally fine-tuned SmolLM2 GGUF from the same pinned conversion toolchain, Q4_0 failed during `FlareEngine.load` with a WASM `RuntimeError: unreachable`. The browser loader skips float copies of layer matrices, but CPU warmup and prefill cannot dispatch raw Q4_0 weights. Q8_0 can dispatch successfully. This is separate from WebGPU capability detection.

The local compatibility patch unpacks each 18-byte Q4_0 block into a 34-byte Q8_0 block: preserve the original two-byte f16 scale; emit the 16 low nibbles minus eight, then the 16 high nibbles minus eight, as signed bytes. Every decoded value is preserved exactly, including negative scales. Conversion is WASM-only and covers both the initial raw map and later raw-weight attachment. Two regression tests check nibble ordering/scales and rejection of malformed lengths; 562 core/loader tests now pass. Q4 browser GPU answers matched the corresponding native Q4 answers on a factual and an unknown-answer prompt.

This is a compatibility workaround, not a native Q4 CPU kernel. It increases in-memory storage and applies the Q8 GPU path. A maintainer may prefer adding direct Q4_0 CPU kernels or an explicit unsupported-format error instead. The historical four-fix patch remains in `patches/flare-smollm2-q8.patch`; `patches/flare-smollm2.patch` additionally contains this conversion. No new upstream duplicate search has been performed for this additional finding, and this draft remains unposted.

## Additional external tokenizer finding

`BpeTokenizer::from_json` read vocabulary and merges but ignored the `pre_tokenizer` configuration. The eight original short smoke prompts did not expose that omission. A full retrieval prompt did: the original Hugging Face tokenizer and llama.cpp encode the middle blank line in `a\n\nb` as two newline tokens, while Flare merged the two newlines. Digits and whitespace boundaries can similarly differ.

The local patch now recognizes the selected tokenizer's exact `Digits(individual_digits=true) -> ByteLevel(add_prefix_space=false, use_regex=true)` pipeline. It splits individual Unicode numbers first, then applies GPT-2 byte-level word/contraction/punctuation boundaries. The whitespace negative-lookahead behavior is implemented explicitly with a pinned Rust regex dependency. Other pre-tokenizer pipelines keep their existing behavior and are not claimed as fixed.

The current WASM tokenizer, rendered chat template and WASM retrieval match the native reference for 698 full evaluation prompts (119,802 token IDs). Another 47 cases match expected IDs generated independently by the original Hugging Face tokenizer, including blank lines, trailing whitespace, numbers, contractions and accents. See `scripts/check_wasm_parity.mjs`, `data/tokenizer-fixtures.json` and `reports/tokenizer-parity.json`. Two new boundary tests bring the Flare core/loader total to 564 passing tests. The previous Q4-loader-only patch is preserved in `patches/flare-smollm2-q4-loader.patch`.

This finding has not been checked for upstream duplicates or posted. It is distinct from the still-unresolved embedded GGUF tokenizer path: the app continues to load the original tokenizer JSON.
