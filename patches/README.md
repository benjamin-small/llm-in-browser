# Remaining Flare compatibility patch

`flare-smollm2.patch` applies only to the exact source revision in `runtime-lock.json`. `flare-smollm2.hashes.json` guards both original and patched files. Run `npm run proof:build`; unknown edits or a stale source cache are rejected.

The patch changes two loader files. On WASM, it expands raw Q4_0 blocks to Q8_0 before CPU warmup/prefill and subsequent GPU upload. Original f16 scales and signed nibble values are preserved. Native loading is unchanged; native unit tests cover signed values/scales and malformed blocks. This increases in-memory storage and remains a compatibility workaround for upstream #529, not a Q4 CPU kernel.

Streaming, tokenizer, Llama rotary-layout and WebGPU-limit repairs now come from upstream. Do not reapply the historical combined patches. Those are preserved in Git history at `0205d786667d2f7f43db35c79798ca2d27ded73b`.
