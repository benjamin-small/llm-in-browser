## Observed behavior

At `a8cb07c`, browser CPU/WASM generation with the official SmolLM2-360M-Instruct Q8_0 GGUF produced incorrect answers; the same model and rendered prompt worked in llama.cpp. The GGUF converter interleaves Q/K rows for adjacent-pair rotary embeddings, while Flare applies split-half rotary embeddings without restoring the corresponding weight layout.

## Reproduction

- Model: `HuggingFaceTB/SmolLM2-360M-Instruct-GGUF`, revision `593b5a2e04c8f3e4ee880263f93e0bd2901ad47f`, `smollm2-360m-instruct-q8_0.gguf`; SHA-256 `48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201`.
- Load its original Hugging Face `tokenizer.json` through `FlareTokenizer.from_json`, then `FlareEngine.load` in a browser module worker. Use CPU initially to isolate GPU errors.
- Render the normal chat template with system `You are a helpful assistant. Answer briefly.` and user `Facts: The research station is named Aster. Its director is Mira Vale. Who is the director of Aster?`
- Generate greedily and compare with llama.cpp `f3f1a8f2760f28325a5ec20c05b171e5b7c83a29` using identical rendered prompt and GGUF. Expected: Mira Vale. One failing output began “The director of the 200000000…”.
- The existing healed-prefill path also failed before the layout repair, separating this from the normal-stream duplication tracked in #518.

[Converter row permutation](https://github.com/ggml-org/llama.cpp/blob/f3f1a8f2760f28325a5ec20c05b171e5b7c83a29/conversion/llama.py#L176); [Flare rotary implementation](https://github.com/sauravpanda/flarellm/blob/a8cb07cf54fa43c4e41664316498ed195fa7b018/flare-core/src/model.rs#L7256).

## Example fix and expected coverage

Our [loader normalization](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch#L44-L185) restores split-half ordering for Llama GGUF Q/K, including both f32 tensors and raw quantized row blocks. [Separate raw-weight attachment](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch#L220-L258) needs the same normalization. Safetensors and other architectures retain their handling.

With our combined layout/streaming/GPU repairs, eight short prompts matched reference text and token IDs on CPU/async, CPU/healed, GPU/async and GPU/healed (32 cases, eight unique prompts). This is combined-patch smoke-test evidence, not an isolated benchmark of this change. Please cover Q and K head counts, raw/f32 equivalence, invalid row shapes, and additional Llama GGUF variants before generalizing.

## Downstream implementation and validation

We run a patched Flare build in [STIX Meta Explorer](https://benjamin-small.github.io/stix-meta-explorer/). The publicly committed [patch set](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch) applies to `a8cb07cf54fa43c4e41664316498ed195fa7b018` (flare-web 0.2.21); its SHA-256 is `b50f6a694c85e2a74c8a4b9a7690ffa103db01d85eb8014a47e4a373f360b3e4`. This is a downstream patch set, not a standalone Flare fork or an upstream-ready PR. It contains several fixes; the relevant section is linked above.

[Validation notes](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent-validation.md) and [build/training instructions](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent.md) describe the tested scope. Measurements were recorded during September 8–9 development; this report is being filed September 21 after checking that upstream main is still at the same SHA. This report does not claim coverage of every model, quantization, or GPU.
