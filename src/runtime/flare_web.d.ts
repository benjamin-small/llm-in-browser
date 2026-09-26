/* tslint:disable */
/* eslint-disable */

/**
 * Flare LLM inference engine, exported to JS.
 *
 * Holds a loaded model and runs greedy/sampled token generation.
 * The detected chat template is available via `chat_template_name` and
 * `apply_chat_template` so the browser demo can format prompts correctly
 * for instruction-tuned models.
 */
export class FlareEngine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Register a stop sequence.
     *
     * Generation halts (without emitting the matched tokens) as soon as the
     * decoded output ends with `sequence`.  Call once per stop string before
     * `begin_stream` or `generate_with_params`.
     *
     * Stop sequences are cleared by `reset()` or `clear_stop_sequences()`.
     *
     * ```javascript
     * engine.add_stop_sequence("<|im_end|>");
     * engine.add_stop_sequence("</s>");
     * engine.begin_stream_with_params(promptIds, 200, 0.8, 0.95, 40, 1.1);
     * ```
     */
    add_stop_sequence(sequence: string): void;
    /**
     * Format a user message (and optional system prompt) using the model's
     * auto-detected chat template.  Returns the formatted prompt string ready
     * to be passed to `FlareTokenizer.encode()`.
     *
     * Pass an empty string for `system_message` to omit the system turn.
     *
     * # JS example
     * ```javascript
     * const prompt = engine.apply_chat_template(
     *   'Explain quantum computing in simple terms.',
     *   'You are a helpful assistant.'
     * );
     * const ids = tokenizer.encode(prompt);
     * const output = engine.generate_tokens(ids, 128);
     * ```
     */
    apply_chat_template(user_message: string, system_message: string): string;
    /**
     * Diagnostic snapshot of the current compute backend as a JSON string.
     *
     * Returns an object with:
     * - `backend` — backend identifier (`"cpu"` or `"webgpu"`).
     * - `has_gpu_weights` — `true` once weights have been uploaded to GPU buffers.
     * - `has_gpu_kv_cache` — `true` once GPU-resident KV storage is initialised.
     * - `has_raw_weights` — `true` once raw quantized weights are held on the CPU side.
     *
     * Benchmarks can call this after `init_gpu()` to confirm WebGPU is
     * actually driving inference instead of silently falling back to CPU.
     *
     * ```javascript
     * await engine.init_gpu();
     * console.log(JSON.parse(engine.backend_info()));
     * // { backend: "webgpu", has_gpu_weights: true, has_gpu_kv_cache: true, has_raw_weights: true }
     * ```
     */
    backend_info(): string;
    /**
     * Start a chunked GGUF load.  The passed bytes only need to span the
     * GGUF header (typically < 1 MB) — after header parsing WASM retains no
     * copy of the bulk tensor data.  Follow with `tensor_byte_offset` /
     * `load_tensor` per tensor, yielding between calls so the UI stays
     * responsive.
     *
     * Prefer this over [`FlareEngine::load`] in the browser — the sync
     * `load` method does ~2-3 s of uninterrupted work which Chrome flags
     * as "not responding" on memory-pressured tabs.
     */
    static begin_load(gguf_bytes: Uint8Array): FlareLoader;
    /**
     * Prepare for token-by-token streaming.
     *
     * Runs the prefill pass on `prompt_tokens`, then initialises internal
     * state so that subsequent calls to `next_token()` each produce one
     * output token.  Call `engine.reset()` before `begin_stream()` to start
     * a fresh conversation.
     *
     * # JS example
     * ```javascript
     * engine.reset();
     * engine.begin_stream(promptIds, 128);
     * function tick() {
     *   const id = engine.next_token();
     *   if (id === undefined) { return; }
     *   output.textContent += tokenizer.decode_one(id);
     *   requestAnimationFrame(tick);   // yield to browser, then continue
     * }
     * requestAnimationFrame(tick);
     * ```
     */
    begin_stream(prompt_tokens: Uint32Array, max_tokens: number): void;
    /**
     * Begin a token-by-token stream, healing the last prompt token.
     *
     * Identical to `begin_stream` but avoids double-processing the final prompt
     * token: the prefill runs only tokens `[0 .. n-2]`, then the first
     * `next_token()` call processes the last prompt token at its correct
     * position `n-1` and produces the first output token.  This keeps RoPE
     * positional embeddings consistent and is recommended when the prompt
     * ends at a natural token boundary (e.g. when encoding a user turn in a
     * chat template).
     *
     * Falls back to `begin_stream` for prompts shorter than 2 tokens.
     *
     * # JS example
     * ```javascript
     * engine.reset();
     * const ids = engine.encode_text(engine.apply_chat_template(userMsg, sysMsg));
     * engine.begin_stream_healed(ids, 256);
     * requestAnimationFrame(function tick() {
     *   const id = engine.next_token();
     *   if (id !== undefined) output.textContent += tokenizer.decode_one(id);
     *   if (!engine.stream_done) requestAnimationFrame(tick);
     * });
     * ```
     */
    begin_stream_healed(prompt_tokens: Uint32Array, max_tokens: number): void;
    /**
     * Like `begin_stream_healed` but with full sampling parameters.
     *
     * Combines position-consistent prefill (see `begin_stream_healed`) with
     * the same temperature / top-p / top-k / repeat-penalty / min-p controls
     * available in `begin_stream_with_params`.
     *
     * # JS example
     * ```javascript
     * engine.reset();
     * const ids = engine.encode_text(engine.apply_chat_template(userMsg, sysMsg));
     * engine.begin_stream_healed_with_params(ids, 256, 0.8, 0.95, 40, 1.1, 0.0);
     * requestAnimationFrame(function tick() {
     *   const id = engine.next_token();
     *   if (id !== undefined) output.textContent += tokenizer.decode_one(id);
     *   if (!engine.stream_done) requestAnimationFrame(tick);
     * });
     * ```
     */
    begin_stream_healed_with_params(prompt_tokens: Uint32Array, max_tokens: number, temperature: number, top_p: number, top_k: number, repeat_penalty: number, min_p: number): void;
    /**
     * Like `begin_stream` but with temperature / top-p sampling.
     *
     * `temperature`: 0.0 = greedy, 0.7–1.0 = typical creative range.
     * `top_p`: nucleus sampling threshold (0.0–1.0); 0.9 is a good default.
     *
     * # JS example
     * ```javascript
     * engine.reset();
     * engine.begin_stream_with_params(promptIds, 128, 0.8, 0.9);
     * function tick() {
     *   const id = engine.next_token();
     *   if (id === undefined) return;
     *   output.textContent += tokenizer.decode_one(id);
     *   requestAnimationFrame(tick);
     * }
     * requestAnimationFrame(tick);
     * ```
     * Begin a token-by-token stream with sampling parameters including top-k.
     *
     * - `temperature`: controls randomness (0 = greedy, higher = more random)
     * - `top_p`: nucleus sampling — keep the smallest token set whose cumulative
     *   probability ≥ `top_p` (1.0 = disabled; applied when < 1.0)
     * - `top_k`: keep only the `top_k` highest-probability tokens before sampling
     *   (0 = disabled; applied when `top_p` is 1.0 and `top_k` > 0)
     * - `repeat_penalty`: penalty applied to logits of recently-seen tokens to
     *   reduce repetition (1.0 = disabled, 1.1–1.3 = typical range)
     *
     * ```javascript
     * engine.begin_stream_with_params(promptIds, 200, 0.8, 0.95, 40, 1.1, 0.0);
     * ```
     */
    begin_stream_with_params(prompt_tokens: Uint32Array, max_tokens: number, temperature: number, top_p: number, top_k: number, repeat_penalty: number, min_p: number): void;
    /**
     * Async variant of [`Self::begin_stream_with_params`].  JS callers
     * `await` the returned Promise before entering the `next_token_async`
     * decode loop.
     *
     * On wasm32 + WebGPU, the prefill currently runs through the CPU
     * dispatch path (which the WebGpuBackend overrides on wasm32) rather
     * than the GPU async-readback path.  The per-matmul `map_async`
     * readback overhead dominates GPU compute for the small prefill
     * regime (e.g. SmolLM2-135M, 32 tokens, 30 layers ≈ 180 readbacks),
     * making CPU prefill ~1.7× faster end-to-end.  `forward_prefill_async`
     * remains in flare-core for callers that want it explicitly and as
     * the foundation for a future batched-readback redesign.
     */
    begin_stream_with_params_async(prompt_tokens: Uint32Array, max_tokens: number, temperature: number, top_p: number, top_k: number, repeat_penalty: number, min_p: number): Promise<void>;
    /**
     * Clear any previously loaded raw quantized weights.
     *
     * After calling this the engine uses the f32 dequantized path for all
     * matrix operations until `load_raw_weights` is called again.
     */
    clear_raw_weights(): void;
    /**
     * Remove all registered stop sequences.
     */
    clear_stop_sequences(): void;
    /**
     * Compute the perplexity of `text` under the loaded model.
     *
     * Encodes `text` with the embedded GGUF vocabulary, runs one forward pass
     * per token, and measures the log-probability of each correct next-token
     * prediction.  Perplexity = exp(−mean(log_probs)).
     *
     * The KV cache is reset **before and after** the evaluation so the engine
     * returns to a clean state.
     *
     * Returns `f32::INFINITY` if the text encodes to fewer than 2 tokens or if
     * no GGUF vocabulary is available.
     *
     * # JS example
     * ```javascript
     * const ppl = engine.compute_perplexity("The quick brown fox");
     * console.log("Perplexity:", ppl);
     * ```
     */
    compute_perplexity(text: string): number;
    /**
     * Count the number of tokens in `text` using the model's embedded GGUF vocabulary.
     *
     * Returns 0 if the model was not loaded from a GGUF file (e.g. SafeTensors only).
     *
     * # JS example
     * ```javascript
     * const n = engine.count_tokens(textarea.value);
     * counter.textContent = `${n} / ${engine.max_seq_len} tokens`;
     * ```
     */
    count_tokens(text: string): number;
    /**
     * Decode token IDs to text using the embedded GGUF vocabulary.
     *
     * Returns an empty string if no GGUF vocab is available.
     *
     * # JS example
     * ```javascript
     * const text = engine.decode_ids(generatedIds);
     * ```
     */
    decode_ids(ids: Uint32Array): string;
    /**
     * Decode a single token ID to its text piece.
     *
     * Convenience wrapper around `decode_ids` for use directly inside a
     * `next_token()` loop so callers don't need a separate `FlareTokenizer`.
     *
     * Returns an empty string if no GGUF vocab is loaded.
     *
     * # JS example
     * ```javascript
     * engine.begin_stream(promptIds, 128);
     * requestAnimationFrame(function tick() {
     *   const id = engine.next_token();
     *   if (id !== undefined) output.textContent += engine.decode_token(id);
     *   if (!engine.stream_done) requestAnimationFrame(tick);
     * });
     * ```
     */
    decode_token(id: number): string;
    /**
     * Decode a single token ID, correctly handling multi-byte UTF-8 sequences.
     *
     * SentencePiece tokenizers encode non-ASCII characters as consecutive
     * byte-level tokens such as `<0xE4>`, `<0xB8>`, `<0xAD>` (the UTF-8
     * encoding of `中`).  The basic `decode_token` function returns incorrect
     * Latin-1 characters in these cases because it treats each byte as an
     * independent Unicode scalar.
     *
     * `decode_token_chunk` accumulates bytes in an internal buffer until a
     * complete, valid UTF-8 sequence is assembled, then returns it as a
     * `String`.  While the sequence is incomplete it returns an empty string,
     * and when a regular (non-byte) token is encountered it flushes any
     * buffered bytes (replacing invalid sequences with U+FFFD) before
     * returning the decoded text.
     *
     * **Use this instead of `decode_token` whenever you are streaming tokens
     * that may include non-Latin characters.**
     *
     * ```javascript
     * engine.begin_stream(prompt, 256);
     * function tick() {
     *   const id = engine.next_token();
     *   if (id !== undefined) output.textContent += engine.decode_token_chunk(id);
     *   if (!engine.stream_done) requestAnimationFrame(tick);
     * }
     * requestAnimationFrame(tick);
     * ```
     */
    decode_token_chunk(id: number): string;
    /**
     * Turn off prefill profiling.  Subsequent prefill calls run with zero
     * timing overhead.
     */
    disable_prefill_profiling(): void;
    /**
     * Look up the token embedding row for `token_id` as a flat `Float32Array`.
     *
     * The length of the returned vector is `hidden_dim`. See also
     * [`FlareEngine::output_projection`] for the inverse tail step.
     */
    embed_token(token_id: number): Float32Array;
    /**
     * Turn on per-phase wall-clock profiling of `forward_prefill`.
     *
     * After calling this, the next `begin_stream*` / `forward_prefill` that runs
     * over more than one token records a breakdown of where time is spent
     * (embed, attention, FFN, KV writes, LM head, etc.).  Retrieve the JSON
     * snapshot via [`FlareEngine::prefill_profile_json`].
     *
     * Overhead when enabled: one `performance.now()` call per phase boundary
     * (~15 per layer).  Turn off via [`FlareEngine::disable_prefill_profiling`]
     * before production inference.
     */
    enable_prefill_profiling(): void;
    /**
     * # JS example
     * ```javascript
     * const ids = engine.encode_text("Hello, world!");
     * const output = engine.generate_tokens(ids, 64);
     * ```
     */
    encode_text(text: string): Uint32Array;
    /**
     * Streaming text-in / text-out generation with a per-token JS callback.
     *
     * Encodes `prompt` with the embedded GGUF vocabulary, generates up to
     * `max_tokens` tokens, and calls `on_token(token_str)` with the decoded
     * text for each token as it is produced.  Returns the number of tokens
     * generated (excluding any EOS token).
     *
     * Returns 0 if no GGUF vocab is available.
     *
     * # Note on browser streaming
     * `on_token` is called synchronously inside WASM, so the browser will
     * not visually update between tokens.  For visible character-by-character
     * output, use `begin_stream` + `next_token` with `requestAnimationFrame`.
     *
     * # JS example
     * ```javascript
     * engine.reset();
     * let out = '';
     * const count = engine.generate_stream("What is Rust?", 128, (token) => {
     *   out += token;
     * });
     * output.textContent = out;
     * ```
     */
    generate_stream(prompt: string, max_tokens: number, on_token: Function): number;
    /**
     * Streaming text-in / text-out with explicit sampling parameters.
     *
     * Like `generate_stream` but with the full set of sampling controls:
     *
     * - `temperature`: 0 = greedy, higher = more diverse
     * - `top_p`: nucleus sampling (1.0 = disabled)
     * - `top_k`: top-k sampling, applied when `top_p` is 1.0 and `min_p` is 0.0 (0 = disabled)
     * - `repeat_penalty`: repetition penalty (1.0 = disabled, 1.1–1.3 = typical)
     * - `min_p`: min-p threshold (0.0 = disabled)
     *
     * Encodes `prompt` with the embedded GGUF vocabulary, generates up to
     * `max_tokens` tokens, and calls `on_token(token_str)` with the decoded
     * text for each token.  Respects stop sequences registered via
     * `add_stop_sequence`.  Returns the number of tokens generated.
     *
     * Returns 0 if no GGUF vocab is available.
     *
     * # JS example
     * ```javascript
     * engine.add_stop_sequence("<|im_end|>");
     * engine.reset();
     * let out = '';
     * const count = engine.generate_stream_with_params(
     *   prompt, 200, 0.8, 0.95, 40, 1.1, 0.0,
     *   (token) => { out += token; }
     * );
     * ```
     */
    generate_stream_with_params(prompt: string, max_tokens: number, temperature: number, top_p: number, top_k: number, repeat_penalty: number, min_p: number, on_token: Function): number;
    /**
     * Full text-in / text-out generation using the embedded GGUF vocabulary.
     *
     * Encodes `prompt` with the embedded vocab, runs greedy generation for up
     * to `max_tokens` steps, then decodes the output back to text. Stops
     * automatically at EOS.
     *
     * Returns an empty string if no GGUF vocab is available.
     *
     * # JS example
     * ```javascript
     * engine.reset();
     * const response = engine.generate_text("What is Rust?", 128);
     * output.textContent = response;
     * ```
     */
    generate_text(prompt: string, max_tokens: number): string;
    /**
     * Full text-in / text-out generation with explicit sampling parameters.
     *
     * Like `generate_text` but with the full set of sampling controls:
     *
     * - `temperature`: 0 = greedy, higher = more diverse
     * - `top_p`: nucleus sampling (1.0 = disabled)
     * - `top_k`: top-k sampling, applied when `top_p` is 1.0 and `min_p` is 0.0 (0 = disabled)
     * - `repeat_penalty`: repetition penalty (1.0 = disabled)
     * - `min_p`: min-p threshold (0.0 = disabled)
     *
     * Returns the decoded generated text. Returns an empty string if no GGUF vocab is available.
     * Respects stop sequences registered via `add_stop_sequence`.
     *
     * # JS example
     * ```javascript
     * engine.reset();
     * const response = engine.generate_text_with_params(
     *   "What is Rust?", 128, 0.8, 0.95, 40, 1.1, 0.0
     * );
     * output.textContent = response;
     * ```
     */
    generate_text_with_params(prompt: string, max_tokens: number, temperature: number, top_p: number, top_k: number, repeat_penalty: number, min_p: number): string;
    /**
     * Generate `max_tokens` tokens starting from `prompt_tokens` (greedy).
     * Stops early at EOS. Returns a Uint32Array of generated token IDs.
     */
    generate_tokens(prompt_tokens: Uint32Array, max_tokens: number): Uint32Array;
    /**
     * Generate a batch of tokens with explicit sampling parameters.
     *
     * - `temperature`: 0 = greedy, higher = more diverse
     * - `top_p`: nucleus sampling (1.0 = disabled)
     * - `top_k`: top-k sampling, applied when `top_p` is 1.0 and `min_p` is 0.0 (0 = disabled)
     * - `repeat_penalty`: repetition penalty applied to recently-seen tokens (1.0 = disabled)
     * - `min_p`: min-p threshold (0.0 = disabled); applied after `top_p`, before `top_k`
     *
     * Stops early at EOS. Uses a fixed LCG RNG seed for reproducibility.
     */
    generate_with_params(prompt_tokens: Uint32Array, max_tokens: number, temperature: number, top_p: number, top_k: number, repeat_penalty: number, min_p: number): Uint32Array;
    /**
     * Try to initialise the WebGPU compute backend.
     *
     * Call this after `load()` to enable GPU-accelerated matrix operations
     * (matvec, matmul, silu_mul). Falls back silently to CPU if WebGPU is
     * unavailable or adapter request fails.
     *
     * Returns `true` if a GPU backend was successfully initialised.
     *
     * ```javascript
     * const engine = FlareEngine.load(bytes);
     * const gpuEnabled = await engine.init_gpu();
     * console.log('GPU:', gpuEnabled);
     * ```
     */
    init_gpu(): Promise<boolean>;
    /**
     * Initialise the WebGPU backend using previously serialised pipeline cache
     * bytes (from `engine.pipeline_cache_data()`).
     *
     * On backends that support driver-managed pipeline caches (Vulkan native),
     * this allows the driver to reuse compiled GPU machine code from a previous
     * run, eliminating cold-start shader recompilation (typically 100ms–2s).
     *
     * On unsupported backends (WebGPU, Metal, DX12) this behaves identically to
     * `init_gpu()` — the cache bytes are silently ignored.
     *
     * ```javascript
     * const cached = localStorage.getItem('flare-pipeline-cache');
     * const cacheBytes = cached ? new Uint8Array(JSON.parse(cached)) : new Uint8Array();
     * await engine.init_gpu_with_cache(cacheBytes);
     * // After inference, persist the cache:
     * const data = engine.pipeline_cache_data();
     * if (data.length > 0) {
     *   localStorage.setItem('flare-pipeline-cache', JSON.stringify(Array.from(data)));
     * }
     * ```
     */
    init_gpu_with_cache(cache_data: Uint8Array): Promise<boolean>;
    /**
     * Load a GGUF model from a Uint8Array of bytes (e.g. from `fetch`).
     */
    static load(gguf_bytes: Uint8Array): FlareEngine;
    /**
     * Load raw quantized weights from GGUF bytes so the GPU fused
     * dequant+matvec kernels can be used during inference.
     *
     * Call this **after** `init_gpu()` so the backend is set before the raw
     * weights are attached.  The method is a no-op (returns `false`) if a
     * layer's weights are in an unsupported quantization format — the engine
     * continues to work using the f32 path loaded at `FlareEngine.load()`.
     *
     * Returns `true` if all layers were loaded successfully, `false` if any
     * layer fell back to the f32 path.
     *
     * ```javascript
     * const engine = FlareEngine.load(bytes);
     * await engine.init_gpu();
     * const ok = engine.load_raw_weights(bytes);
     * console.log('Raw weights loaded:', ok);
     * ```
     */
    load_raw_weights(gguf_bytes: Uint8Array): boolean;
    /**
     * Merge a LoRA adapter (SafeTensors format) into the model weights.
     *
     * Pass the raw bytes of a `.safetensors` file containing LoRA A/B matrices.
     * After merging, the adapter's effect is permanent for this engine instance;
     * call `FlareEngine.load()` again to restore the base model.
     *
     * ```javascript
     * const resp = await fetch('lora-adapter.safetensors');
     * const bytes = new Uint8Array(await resp.arrayBuffer());
     * engine.merge_lora(bytes);
     * ```
     */
    merge_lora(adapter_bytes: Uint8Array): void;
    /**
     * Merge a LoRA adapter with a custom alpha scaling factor.
     *
     * Same as `merge_lora` but overrides the alpha value embedded in the
     * adapter file.  The effective scaling is `alpha / rank`.
     */
    merge_lora_with_alpha(adapter_bytes: Uint8Array, alpha: number): void;
    /**
     * Generate and return the next token ID, or `undefined` when the stream
     * is complete (EOS reached, `max_tokens` exhausted, or `stop_stream()`
     * was called).
     *
     * Sampling parameters are those set by the most recent `begin_stream` or
     * `begin_stream_with_params` call.  Call this inside
     * `requestAnimationFrame` so the browser can update the DOM between
     * tokens and the page remains responsive.
     */
    next_token(): number | undefined;
    /**
     * Async variant of [`Self::next_token`].  Required on wasm32 browsers
     * when WebGPU is the active backend — the sync `forward` path deadlocks
     * on the final `map_async` + `recv()` readback because the WebGPU
     * mapping callback is serviced by JS microtasks that can't run during
     * a sync WASM call, and `device.poll(Wait)` is a no-op on wasm32.
     *
     * Returns a Promise that resolves to the generated token id (or
     * `undefined` on stream end).  Identical sampling + stop-sequence +
     * EOS handling as `next_token`.  Safe to use on CPU backends too —
     * the async path falls through to the sync fast path there.
     */
    next_token_async(): Promise<number | undefined>;
    /**
     * Apply final RMSNorm + output projection to a hidden state and
     * return logits over the vocabulary.
     *
     * `hidden` must have length `hidden_dim`. The returned vector has
     * length `vocab_size`.
     */
    output_projection(hidden: Float32Array): Float32Array;
    /**
     * Return a JSON string summarising the performance metrics from the last
     * generation call.
     *
     * ```javascript
     * const perf = JSON.parse(engine.performance_summary());
     * console.log(`TTFT: ${perf.prefill_ms.toFixed(1)} ms`);
     * console.log(`Decode: ${perf.tokens_per_second.toFixed(1)} tok/s`);
     * ```
     */
    performance_summary(): string;
    /**
     * JSON snapshot of the most recent prefill profile, or `"null"` if
     * profiling is disabled or no prefill has run since it was enabled.
     *
     * All `*_ms` fields are wall-clock milliseconds, summed across all
     * transformer layers where applicable.  `seq_len` is the number of
     * prompt tokens processed; `num_layers` is the transformer depth.
     */
    prefill_profile_json(): string;
    /**
     * Reset the KV cache (start a new conversation).
     *
     * Also clears stop sequences, the internal text accumulator, and
     * restores the RNG seed to the default `0x12345678`.
     */
    reset(): void;
    /**
     * Set the repetition-penalty look-back window (number of recent tokens to
     * penalise).  Use `0` to disable repetition penalty entirely.  Default: 64.
     *
     * Takes effect on the next `begin_stream*` call.
     *
     * # JS example
     * ```javascript
     * engine.set_repeat_last_n(128); // wider window for creative writing
     * engine.set_repeat_last_n(0);   // disable repeat penalty
     * ```
     */
    set_repeat_last_n(n: number): void;
    /**
     * Set the LCG RNG seed used for the next sampled generation call.
     *
     * Controls the random state passed to `begin_stream_with_params` and
     * `generate_with_params`, enabling reproducible outputs.  The seed is
     * applied on the next call and then *not* automatically reset, so the
     * same seed will be reused on subsequent calls unless `set_rng_seed` or
     * `reset()` is called again.
     *
     * `reset()` restores the seed to the default `0x12345678`.
     *
     * ```javascript
     * engine.set_rng_seed(42);
     * const out1 = engine.generate_text("Hello", 50);
     * engine.set_rng_seed(42);
     * const out2 = engine.generate_text("Hello", 50);
     * // out1 === out2
     * ```
     */
    set_rng_seed(seed: number): void;
    /**
     * Set how many top log-probability entries to capture after each forward
     * pass.  Pass `0` (the default) to disable and save the computation.
     *
     * When enabled, `top_logprobs` is populated after every `next_token()`
     * call and after every token in `generate_stream_with_params`.
     *
     * # JS example
     * ```javascript
     * engine.set_top_logprobs(5);
     * engine.begin_stream(promptIds, 64);
     * while (!engine.stream_done) {
     *   engine.next_token();
     *   const lp = engine.top_logprobs; // Float32Array [id0, lp0, id1, lp1, ...]
     * }
     * ```
     */
    set_top_logprobs(n: number): void;
    /**
     * Signal the current stream to stop after the next `next_token()` call.
     * The JS Stop button should call this, then wait for `next_token()` to
     * return `undefined` before updating the UI.
     */
    stop_stream(): void;
    /**
     * Truncate `text` so that it fits within `budget` tokens when encoded.
     *
     * Encodes `text` with the embedded GGUF vocabulary, keeps the **last**
     * `budget` tokens (tail of the text is preferred, so recent context is
     * preserved), and decodes them back to a string.  Returns `text` unchanged
     * if it already fits or if no vocab is available.
     *
     * A typical call reserves space for the system prompt + generated output:
     *
     * ```javascript
     * // Keep only the tail of the conversation that fits in the context
     * const budget = engine.max_seq_len - 256; // leave 256 tokens for output
     * const trimmed = engine.truncate_to_context(conversationText, budget);
     * ```
     */
    truncate_to_context(text: string, budget: number): string;
    /**
     * Run a single dummy forward pass to pre-compile WebGPU shader pipelines.
     *
     * WebGPU (and wgpu on native) compiles shader pipelines lazily on the
     * first dispatch.  This causes a noticeable latency spike — often 100ms
     * to several seconds — when the user makes their first inference request.
     *
     * Call `warmup()` once after `init_gpu()` completes to trigger all shader
     * compilations in the background so the first real request feels fast.
     * The KV cache is reset after the warmup so the engine is in a clean state.
     *
     * Returns `true` if the warmup forward pass ran without error, `false` if
     * the model has not been loaded.
     *
     * # JS example
     * ```javascript
     * const engine = FlareEngine.load(bytes);
     * await engine.init_gpu();
     * engine.warmup(); // trigger shader compilation
     * // First real inference is now fast
     * engine.begin_stream(promptIds, 128);
     * ```
     */
    warmup(): boolean;
    /**
     * Whether the model requests automatic BOS token prepending.
     *
     * Sourced from `tokenizer.ggml.add_bos_token` in the GGUF metadata.
     * When `true`, all generation methods (`generate_tokens`, `begin_stream`,
     * `generate_text`, `generate_stream`) automatically prepend the BOS token
     * to the input token sequence unless it is already the first token.
     */
    readonly add_bos_token: boolean;
    /**
     * Model architecture name from `general.architecture` in the GGUF metadata.
     *
     * Returns a lowercase string such as `"llama"`, `"mistral"`, `"gemma2"`,
     * `"phi3"`, or `"qwen2"`. Returns `"unknown"` if the field is absent.
     */
    readonly architecture: string;
    /**
     * BOS (beginning of sequence) token ID from the GGUF model metadata, if present.
     * Some models require this to be prepended to the input token sequence.
     */
    readonly bos_token_id: number | undefined;
    /**
     * Name of the auto-detected chat template (e.g. `"ChatML"`, `"Llama3"`,
     * `"Alpaca"`, `"Raw"`).  Use this to display the template in the UI and
     * decide whether to call `apply_chat_template` before encoding.
     */
    readonly chat_template_name: string;
    /**
     * Fraction of the context window consumed (0.0 = empty, 1.0 = full).
     *
     * Equivalent to `tokens_used / max_seq_len`. Returns 0.0 if `max_seq_len` is 0.
     */
    readonly context_window_pct: number;
    /**
     * EOS (end of sequence) token ID from the GGUF model metadata, if present.
     * Generation stops automatically when this token is produced.
     */
    readonly eos_token_id: number | undefined;
    /**
     * Returns `true` if raw quantized weights are currently loaded.
     */
    readonly has_raw_weights: boolean;
    /**
     * Get the hidden dimension.
     */
    readonly hidden_dim: number;
    /**
     * Milliseconds spent in decode steps of the last generation call.
     *
     * For batch generation (`generate_tokens` etc.) this is always 0 — see
     * `last_prefill_ms` for the total time.  For the streaming API this
     * accumulates across all `next_token()` calls since the last
     * `begin_stream()`.
     */
    readonly last_decode_ms: number;
    /**
     * Raw pre-temperature logits from the most recent forward pass.
     *
     * Returns the full vocabulary logit vector as a `Float32Array`.  These
     * are the raw values *before* temperature scaling, repetition penalty,
     * or any sampling filter — equivalent to the model's raw next-token
     * distribution.
     *
     * Useful for:
     * - Scoring candidate continuations (classification, ranking)
     * - Computing perplexity / cross-entropy
     * - Inspecting the model's "confidence" about the next token
     *
     * Returns an empty array before any inference has been run, and is
     * cleared by `reset()`.
     *
     * ```javascript
     * engine.begin_stream(promptIds, 1); // one token prefill+decode
     * engine.next_token();
     * const logits = engine.last_logits; // Float32Array of vocab_size
     * const topTokenId = logits.indexOf(Math.max(...logits));
     * ```
     */
    readonly last_logits: Float32Array;
    /**
     * Milliseconds spent in the last prefill (prompt processing) phase.
     *
     * For `generate_tokens` / `generate_text` / `generate_with_params` this
     * covers the entire call (prefill + decode are not separated internally).
     * For the streaming API (`begin_stream` + `next_token`) this covers only
     * the `begin_stream()` call.
     */
    readonly last_prefill_ms: number;
    /**
     * Number of tokens generated by the last generation call (excludes prompt
     * tokens and the EOS token itself).
     */
    readonly last_tokens_generated: number;
    /**
     * Maximum sequence length (context window size) of the loaded model.
     *
     * Use this to warn users when their prompt is approaching the limit.
     */
    readonly max_seq_len: number;
    /**
     * All GGUF model metadata as a JSON string.
     *
     * Returns a JSON object mapping each metadata key to its value.
     * Large vocabulary arrays (`tokenizer.ggml.tokens`, `.merges`, `.scores`,
     * `.added_tokens`) are omitted to keep the payload practical.
     * Small arrays (≤ 64 entries) are included as JSON arrays.
     *
     * Returns `"{}"` if the model was not loaded from a GGUF file.
     *
     * ```javascript
     * const meta = JSON.parse(engine.metadata_json);
     * console.log(meta["llama.context_length"]); // e.g. 4096
     * ```
     */
    readonly metadata_json: string;
    /**
     * Model display name from `general.name` in the GGUF metadata.
     *
     * Returns the human-readable name embedded by the model author (e.g.
     * `"Llama 3.2 1B Instruct"`). Returns an empty string if the field is absent.
     */
    readonly model_name: string;
    /**
     * Get the number of attention heads.
     */
    readonly num_heads: number;
    /**
     * Get the number of layers.
     */
    readonly num_layers: number;
    /**
     * Serialise the driver-managed GPU pipeline cache to bytes.
     *
     * Returns an opaque blob that can be passed to `init_gpu_with_cache()` on
     * the next startup to skip shader recompilation.  Store it in
     * `localStorage` or `IndexedDB` between page loads.
     *
     * Returns an empty `Uint8Array` if no GPU is active, or if the current
     * backend does not support pipeline caching (WebGPU, Metal, DX12).
     */
    readonly pipeline_cache_data: Uint8Array;
    /**
     * Raw Jinja2 chat template string from the GGUF model metadata, if present.
     *
     * This is the `tokenizer.chat_template` field embedded by the model author.
     * Use this with a JavaScript Jinja2 renderer (e.g. `nunjucks`) for accurate
     * prompt formatting across all model families, rather than relying on the
     * simplified built-in `apply_chat_template`.
     *
     * Returns `undefined` if the GGUF file did not include a chat template.
     */
    readonly raw_chat_template: string | undefined;
    /**
     * Current repetition-penalty window size (0 = disabled).
     */
    readonly repeat_last_n: number;
    /**
     * Whether the current stream has finished.
     */
    readonly stream_done: boolean;
    /**
     * Why the most-recent stream stopped.
     *
     * Returns one of:
     * - `"eos"` — the model emitted the EOS token
     * - `"length"` — `max_tokens` budget was exhausted
     * - `"stop_sequence"` — a registered stop sequence was matched
     * - `"user"` — `stop_stream()` was called
     * - `""` (empty) — stream not yet started or still running
     *
     * # JS example
     * ```javascript
     * while (!engine.stream_done) engine.next_token();
     * console.log("Stopped because:", engine.stream_stop_reason);
     * ```
     */
    readonly stream_stop_reason: string;
    /**
     * Decode throughput in tokens per second for the last generation call.
     *
     * For the streaming API this is calculated from `last_decode_ms`.
     * For batch generation this is calculated from `last_prefill_ms`
     * (the total call duration).
     *
     * Returns 0.0 if no generation has been run or if timing data is
     * unavailable.
     */
    readonly tokens_per_second: number;
    /**
     * How many tokens of context space remain before the window is full.
     *
     * Equivalent to `max_seq_len - tokens_used`. Returns 0 when the context is
     * already full or `max_seq_len` is 0.
     *
     * # JS example
     * ```javascript
     * if (engine.tokens_remaining < 64) {
     *   console.warn("Context window almost full — consider resetting.");
     * }
     * ```
     */
    readonly tokens_remaining: number;
    /**
     * Number of tokens currently consumed in the KV-cache session (prompt + generated).
     *
     * Updated after every generation call; reset to 0 by `engine.reset()`.
     * Use with `max_seq_len` to build a context-usage progress bar.
     */
    readonly tokens_used: number;
    /**
     * Interleaved top-N log-probabilities from the last forward pass.
     *
     * Layout: `[token_id_0 as f32, log_prob_0, token_id_1 as f32, log_prob_1, ...]`
     * sorted by descending log-probability.  Length is `top_logprobs_n * 2`.
     *
     * Returns an empty array if `set_top_logprobs(0)` (default) or before
     * any inference has been run.
     */
    readonly top_logprobs: Float32Array;
    /**
     * Get the vocabulary size of the loaded model.
     */
    readonly vocab_size: number;
}

/**
 * In-progress GGUF load.  Breaks the monolithic [`FlareEngine::load`] into
 * per-tensor steps so JS can `await Promise.resolve()` between them and keep
 * the main thread responsive.  JS owns the source `Uint8Array` and hands
 * WASM a per-tensor slice each step — the loader itself stores no copy of
 * the bulk data, so peak memory stays at one model's worth.
 *
 * ```javascript
 * const loader = FlareEngine.begin_load(gguf_bytes);       // parses header only
 * const total = loader.total_tensors;
 * for (let i = 0; i < total; i++) {
 *   const off = loader.tensor_byte_offset(i);
 *   const len = loader.tensor_byte_length(i);
 *   loader.load_tensor(i, gguf_bytes.subarray(off, off + len));
 *   if (i % 10 === 0) await new Promise(r => setTimeout(r, 0)); // yield
 * }
 * const engine = loader.finalize();
 * ```
 *
 * Per-tensor work is a single memcpy + optional dequant.  The yields let GC
 * run and keep Chrome from declaring the page unresponsive.
 */
export class FlareLoader {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Finalise the load: assemble `ModelWeights`, build the `Model`, run
     * warmup, and return a ready-to-use `FlareEngine`.  Consumes the loader.
     *
     * If any layer's matmul tensors couldn't be retained as raw (mixed-quant
     * model), this returns an error — the caller should fall back to the
     * sync `FlareEngine.load` which can do a second f32 dequant pass.
     */
    finalize(): FlareEngine;
    /**
     * Load tensor `i` from the caller-provided byte slice, which must be
     * exactly `tensor_byte_length(i)` bytes and positioned at
     * `tensor_byte_offset(i)` within the original GGUF.
     */
    load_tensor(i: number, tensor_bytes: Uint8Array): void;
    /**
     * Byte length of tensor `i`'s data in the original GGUF file.
     */
    tensor_byte_length(i: number): number;
    /**
     * Byte offset (within the original GGUF file) where tensor `i`'s data
     * starts.  JS uses this to slice its `Uint8Array` and hand WASM just the
     * bytes for that tensor.  f64 return because tensor offsets in large
     * GGUFs can exceed `u32::MAX`.
     */
    tensor_byte_offset(i: number): number;
    /**
     * Tensor name — useful for progress UIs.
     */
    tensor_name(i: number): string;
    /**
     * Number of tensors loaded so far (via successful `load_tensor` calls).
     */
    readonly loaded_tensors: number;
    /**
     * Total number of tensors in the GGUF file.
     */
    readonly total_tensors: number;
}

/**
 * Progressive loader that fetches a GGUF model from a URL with streaming
 * download progress.
 *
 * This enables the browser demo to show download progress as the model
 * arrives over the network, then layer-loading progress as the model is
 * parsed. For a 500MB Q4 model the download phase dominates; displaying
 * progress prevents the page from appearing frozen.
 *
 * # JS example
 *
 * ```javascript
 * const loader = new FlareProgressiveLoader('https://example.com/model.gguf');
 * const engine = await loader.load((loaded, total) => {
 *   const pct = total > 0 ? Math.round(loaded / total * 100) : 0;
 *   progressBar.value = pct / 100;
 *   statusText.textContent = `Downloading… ${pct}%`;
 * });
 * ```
 */
export class FlareProgressiveLoader {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Fetch the model from the URL, calling `on_progress(loaded_bytes, total_bytes)`
     * as each chunk arrives, then parse and return a `FlareEngine`.
     *
     * `total_bytes` is 0 when the server does not send a `Content-Length` header
     * (e.g. when the response is gzip-compressed or chunked).
     */
    load(on_progress: Function): Promise<FlareEngine>;
    /**
     * Create a loader for the given model URL.
     */
    constructor(url: string);
}

/**
 * BPE tokenizer exported to JS for encoding prompts and decoding generated tokens.
 *
 * Load from a HuggingFace `tokenizer.json` string, then use `encode` / `decode`
 * in coordination with `FlareEngine` to run full text-in / text-out inference.
 *
 * # JS example
 *
 * ```javascript
 * const resp = await fetch('tokenizer.json');
 * const json = await resp.text();
 * const tok = FlareTokenizer.from_json(json);
 *
 * const ids = tok.encode("Hello, world!");
 * const engine = FlareEngine.load(modelBytes);
 * const out = engine.generate_tokens(ids, 64);
 * console.log(tok.decode(out));
 * ```
 */
export class FlareTokenizer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Decode a sequence of token IDs to text.
     */
    decode(tokens: Uint32Array): string;
    /**
     * Decode a single token ID to text (useful for streaming output).
     */
    decode_one(token_id: number): string;
    /**
     * Encode text to a sequence of token IDs.
     */
    encode(text: string): Uint32Array;
    /**
     * Load a tokenizer from the text of a HuggingFace `tokenizer.json` file.
     */
    static from_json(json: string): FlareTokenizer;
    /**
     * BOS (beginning of sequence) token ID, if defined.
     */
    readonly bos_token_id: number | undefined;
    /**
     * EOS (end of sequence) token ID, if defined.
     */
    readonly eos_token_id: number | undefined;
    /**
     * Vocabulary size.
     */
    readonly vocab_size: number;
}

/**
 * Save model bytes to OPFS.
 *
 * Creates the `flare-models` directory if it does not exist.  Overwrites any
 * existing file with the same name.
 */
export function cache_model(model_name: string, data: Uint8Array): Promise<void>;

/**
 * Delete a cached model from OPFS.
 */
export function delete_cached_model(model_name: string): Promise<void>;

/**
 * Get basic device info as a JSON string.
 */
export function device_info(): string;

/**
 * Check if a model is cached in OPFS by name.
 *
 * Returns `false` if OPFS is unavailable or the model is not found.
 */
export function is_model_cached(model_name: string): Promise<boolean>;

/**
 * List all cached models with their sizes (in bytes).
 *
 * Returns a JSON-serialised array of objects: `[{name: string, size: number}, ...]`.
 * Returns `"[]"` if OPFS is unavailable or the models directory does not exist.
 */
export function list_cached_models(): Promise<any>;

/**
 * Load model bytes from OPFS.
 *
 * Returns `null` (JS) / `None` (Rust) if the model is not cached or OPFS is
 * unavailable.
 */
export function load_cached_model(model_name: string): Promise<any>;

/**
 * Set up better panic messages in the browser console.
 */
export function start(): void;

/**
 * Get storage usage and quota estimate.
 *
 * Returns a JSON string: `{usage: number, quota: number}`.
 * Returns `"{}"` if the Storage API is unavailable.
 */
export function storage_estimate(): Promise<any>;

/**
 * Check if this WASM build was compiled with relaxed SIMD support.
 *
 * Relaxed SIMD provides hardware-specific faster operations like fused
 * multiply-add (`f32x4_relaxed_madd`) that map directly to ARM NEON and
 * x86 SSE/AVX FMA instructions. When enabled, matvec operations use FMA
 * for ~15-30% speedup.
 *
 * This is a compile-time feature: the WASM binary either includes relaxed
 * SIMD instructions or it does not. The browser validates them at module
 * load time, so if this module loaded successfully and returns `true`,
 * relaxed SIMD is active.
 */
export function supports_relaxed_simd(): boolean;

/**
 * Check if the browser exposes the Web Speech API for speech recognition.
 *
 * This probes `window.SpeechRecognition` and the WebKit-prefixed
 * `window.webkitSpeechRecognition`. Returning `true` means the demo voice
 * mode can capture microphone input and produce transcripts through the
 * platform speech engine. This is a foundation for the voice pipeline
 * (issue #395); a fully offline path will eventually run Whisper in WASM.
 */
export function supports_speech_recognition(): boolean;

/**
 * Check if the browser exposes the Web Speech API for speech synthesis.
 *
 * Returns `true` when `window.speechSynthesis` is available, enabling the
 * demo voice mode to speak model responses. A fully offline path will
 * eventually run a neural TTS model in WASM.
 */
export function supports_speech_synthesis(): boolean;

/**
 * Check if WebNN is available in the current browser.
 *
 * WebNN (`navigator.ml`) exposes neural-network acceleration through
 * platform NPUs/DSPs. This is a foundation check so JS code can decide
 * whether to build a WebNN graph from exported weights.
 */
export function supports_webnn(): boolean;

/**
 * Check if WebTransport is available in the current browser.
 *
 * WebTransport (`window.WebTransport`) is a modern transport API built on
 * HTTP/3 QUIC streams. It allows opening multiple parallel bidirectional
 * streams to the same origin with lower head-of-line blocking than fetch().
 * Useful for progressive model loading where different byte ranges of the
 * GGUF file can be downloaded concurrently.
 *
 * Note: actually using WebTransport for parallel range downloads requires
 * server-side support (HTTP/3 endpoint that accepts byte-range requests
 * on streams). This check only reports browser capability — the JS loader
 * will fall back to `fetch()` when the server does not cooperate.
 */
export function supports_webtransport(): boolean;

/**
 * Check if WebGPU is available in the current browser.
 *
 * Works on both the main thread (reads `window.navigator`) and inside a
 * dedicated Web Worker (reads `self.navigator` via `WorkerGlobalScope`).
 * Returning `true` means `WebGpuBackend::new()` has a chance of succeeding;
 * it does not guarantee an adapter or device will actually be granted.
 */
export function webgpu_available(): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_flareengine_free: (a: number, b: number) => void;
    readonly __wbg_flareloader_free: (a: number, b: number) => void;
    readonly __wbg_flareprogressiveloader_free: (a: number, b: number) => void;
    readonly __wbg_flaretokenizer_free: (a: number, b: number) => void;
    readonly cache_model: (a: number, b: number, c: number, d: number) => any;
    readonly delete_cached_model: (a: number, b: number) => any;
    readonly device_info: () => [number, number];
    readonly flareengine_add_bos_token: (a: number) => number;
    readonly flareengine_add_stop_sequence: (a: number, b: number, c: number) => void;
    readonly flareengine_apply_chat_template: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly flareengine_architecture: (a: number) => [number, number];
    readonly flareengine_backend_info: (a: number) => [number, number];
    readonly flareengine_begin_load: (a: number, b: number) => [number, number, number];
    readonly flareengine_begin_stream: (a: number, b: number, c: number, d: number) => void;
    readonly flareengine_begin_stream_healed: (a: number, b: number, c: number, d: number) => void;
    readonly flareengine_begin_stream_healed_with_params: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly flareengine_begin_stream_with_params: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly flareengine_begin_stream_with_params_async: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
    readonly flareengine_bos_token_id: (a: number) => number;
    readonly flareengine_chat_template_name: (a: number) => [number, number];
    readonly flareengine_clear_raw_weights: (a: number) => void;
    readonly flareengine_clear_stop_sequences: (a: number) => void;
    readonly flareengine_compute_perplexity: (a: number, b: number, c: number) => number;
    readonly flareengine_context_window_pct: (a: number) => number;
    readonly flareengine_count_tokens: (a: number, b: number, c: number) => number;
    readonly flareengine_decode_ids: (a: number, b: number, c: number) => [number, number];
    readonly flareengine_decode_token: (a: number, b: number) => [number, number];
    readonly flareengine_decode_token_chunk: (a: number, b: number) => [number, number];
    readonly flareengine_disable_prefill_profiling: (a: number) => void;
    readonly flareengine_embed_token: (a: number, b: number) => [number, number];
    readonly flareengine_enable_prefill_profiling: (a: number) => void;
    readonly flareengine_encode_text: (a: number, b: number, c: number) => [number, number];
    readonly flareengine_eos_token_id: (a: number) => number;
    readonly flareengine_generate_stream: (a: number, b: number, c: number, d: number, e: any) => number;
    readonly flareengine_generate_stream_with_params: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: any) => number;
    readonly flareengine_generate_text: (a: number, b: number, c: number, d: number) => [number, number];
    readonly flareengine_generate_text_with_params: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly flareengine_generate_tokens: (a: number, b: number, c: number, d: number) => [number, number];
    readonly flareengine_generate_with_params: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly flareengine_has_raw_weights: (a: number) => number;
    readonly flareengine_hidden_dim: (a: number) => number;
    readonly flareengine_init_gpu: (a: number) => any;
    readonly flareengine_init_gpu_with_cache: (a: number, b: number, c: number) => any;
    readonly flareengine_last_decode_ms: (a: number) => number;
    readonly flareengine_last_logits: (a: number) => [number, number];
    readonly flareengine_last_prefill_ms: (a: number) => number;
    readonly flareengine_last_tokens_generated: (a: number) => number;
    readonly flareengine_load: (a: number, b: number) => [number, number, number];
    readonly flareengine_load_raw_weights: (a: number, b: number, c: number) => number;
    readonly flareengine_max_seq_len: (a: number) => number;
    readonly flareengine_merge_lora: (a: number, b: number, c: number) => [number, number];
    readonly flareengine_merge_lora_with_alpha: (a: number, b: number, c: number, d: number) => [number, number];
    readonly flareengine_metadata_json: (a: number) => [number, number];
    readonly flareengine_model_name: (a: number) => [number, number];
    readonly flareengine_next_token: (a: number) => number;
    readonly flareengine_next_token_async: (a: number) => any;
    readonly flareengine_num_heads: (a: number) => number;
    readonly flareengine_num_layers: (a: number) => number;
    readonly flareengine_output_projection: (a: number, b: number, c: number) => [number, number];
    readonly flareengine_performance_summary: (a: number) => [number, number];
    readonly flareengine_pipeline_cache_data: (a: number) => [number, number];
    readonly flareengine_prefill_profile_json: (a: number) => [number, number];
    readonly flareengine_raw_chat_template: (a: number) => [number, number];
    readonly flareengine_repeat_last_n: (a: number) => number;
    readonly flareengine_reset: (a: number) => void;
    readonly flareengine_set_repeat_last_n: (a: number, b: number) => void;
    readonly flareengine_set_rng_seed: (a: number, b: number) => void;
    readonly flareengine_set_top_logprobs: (a: number, b: number) => void;
    readonly flareengine_stop_stream: (a: number) => void;
    readonly flareengine_stream_done: (a: number) => number;
    readonly flareengine_stream_stop_reason: (a: number) => [number, number];
    readonly flareengine_tokens_per_second: (a: number) => number;
    readonly flareengine_tokens_remaining: (a: number) => number;
    readonly flareengine_tokens_used: (a: number) => number;
    readonly flareengine_top_logprobs: (a: number) => [number, number];
    readonly flareengine_truncate_to_context: (a: number, b: number, c: number, d: number) => [number, number];
    readonly flareengine_vocab_size: (a: number) => number;
    readonly flareengine_warmup: (a: number) => number;
    readonly flareloader_finalize: (a: number) => [number, number, number];
    readonly flareloader_load_tensor: (a: number, b: number, c: number, d: number) => [number, number];
    readonly flareloader_loaded_tensors: (a: number) => number;
    readonly flareloader_tensor_byte_length: (a: number, b: number) => number;
    readonly flareloader_tensor_byte_offset: (a: number, b: number) => number;
    readonly flareloader_tensor_name: (a: number, b: number) => [number, number];
    readonly flareloader_total_tensors: (a: number) => number;
    readonly flareprogressiveloader_load: (a: number, b: any) => any;
    readonly flareprogressiveloader_new: (a: number, b: number) => number;
    readonly flaretokenizer_bos_token_id: (a: number) => number;
    readonly flaretokenizer_decode: (a: number, b: number, c: number) => [number, number, number, number];
    readonly flaretokenizer_decode_one: (a: number, b: number) => [number, number, number, number];
    readonly flaretokenizer_encode: (a: number, b: number, c: number) => [number, number, number, number];
    readonly flaretokenizer_eos_token_id: (a: number) => number;
    readonly flaretokenizer_from_json: (a: number, b: number) => [number, number, number];
    readonly flaretokenizer_vocab_size: (a: number) => number;
    readonly is_model_cached: (a: number, b: number) => any;
    readonly list_cached_models: () => any;
    readonly load_cached_model: (a: number, b: number) => any;
    readonly storage_estimate: () => any;
    readonly supports_relaxed_simd: () => number;
    readonly supports_speech_recognition: () => number;
    readonly supports_speech_synthesis: () => number;
    readonly supports_webnn: () => number;
    readonly supports_webtransport: () => number;
    readonly webgpu_available: () => number;
    readonly start: () => void;
    readonly wasm_bindgen__convert__closures_____invoke__hd86d3cd10d86238c: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h32e9711f4622383e: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h63860f0889a1664c: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
