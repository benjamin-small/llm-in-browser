## Observed behavior

At `a8cb07c`, `init_gpu()` returned true and `backend_info()` reported resident GPU weights/KV, but async decoding returned all-zero logits and repeatedly selected token ID 0. This occurred with SmolLM2-360M-Instruct Q8_0 in Chromium 152 on Apple M5 Max.

Capturing a WebGPU validation error exposed:

```text
The total use of workgroup storage (16416 bytes) is larger than the maximum allowed (16384 bytes).
This adapter supports a higher maxComputeWorkgroupStorageSize of 32768,
which can be specified in requiredLimits when calling requestDevice().
While initializing [ComputePipeline "attention_scores_f16"]
```

## Cause and reproduction

The [device request](https://github.com/sauravpanda/flarellm/blob/a8cb07cf54fa43c4e41664316498ed195fa7b018/flare-gpu/src/backend.rs#L258) retains the default 16 KiB workgroup-storage limit. The attention shader requires more, even though the tested adapter supports 32 KiB.

Build flare-web, load the official SmolLM2-360M-Instruct Q8_0 GGUF with its original tokenizer in a module worker, call `init_gpu()`, and use `begin_stream_with_params_async` / `next_token_async` for a short greedy prompt. Inspect `last_logits` after the first step; capability flags alone did not detect the invalid pipeline. Compare CPU output and capture a validation error scope around GPU dispatch. The other model-correctness issues should be controlled separately.

## Example fix and limits

Our [patch](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch#L259-L302) requests the adapter's supported workgroup-storage size, rejects adapters below 16,672 bytes (covering the attention shader family), and checks validation errors before trusting async readback. This restored nonzero logits and reference-matching answers with our combined correctness fixes.

The diagnostic patch currently panics on a validation error so the worker reports it. That is not proposed as the final library error API: please propagate a structured error or deliberately fall back to CPU. Requesting the minimum needed limit, reducing shader scratch space, or selecting smaller shaders may be preferable to our conservative adapter rejection.

Regression coverage should exercise a 16 KiB adapter/limit, a sufficiently capable adapter, failed pipeline/dispatch handling, and actual finite/nonzero inference output. Related #510 concerns prefill performance; this is a decode correctness/error-reporting failure.

## Downstream implementation and validation

We run a patched Flare build in [STIX Meta Explorer](https://benjamin-small.github.io/stix-meta-explorer/). The publicly committed [patch set](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch) applies to `a8cb07cf54fa43c4e41664316498ed195fa7b018` (flare-web 0.2.21); its SHA-256 is `b50f6a694c85e2a74c8a4b9a7690ffa103db01d85eb8014a47e4a373f360b3e4`. This is a downstream patch set, not a standalone Flare fork or an upstream-ready PR. It contains several fixes; the relevant section is linked above.

[Validation notes](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent-validation.md) and [build/training instructions](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent.md) describe the tested scope. Measurements were recorded during September 8–9 development; this report is being filed September 21 after checking that upstream main is still at the same SHA. This report does not claim coverage of every model, quantization, or GPU.
