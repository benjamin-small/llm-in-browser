## Observed behavior

At `a8cb07c`, loading the original SmolLM2 tokenizer JSON does not ensure token-ID parity. `BpeTokenizer::from_json` reads vocabulary/merges but does not honor `pre_tokenizer`. BPE can therefore merge across boundaries that the original tokenizer forbids.

The selected model uses `Digits(individual_digits=true)` followed by `ByteLevel(add_prefix_space=false, use_regex=true)`. For `a\n\nb`, the reference encodes the middle blank line as two newline tokens; upstream Flare merges it. Digits, contractions and whitespace boundaries can also differ.

## Minimal comparison

Use `tokenizer.json` from `HuggingFaceTB/SmolLM2-360M-Instruct` revision `a10cc1512eabd3dde888204e902eca88bddb4951` (SHA-256 `9ca9acddb6525a194ec8ac7a87f24fbba7232a9a15ffa1af0c1224fcd888e47c`):

```js
const tok = FlareTokenizer.from_json(tokenizerJson);
console.log(Array.from(tok.encode('a\n\nb')));
// Hugging Face reference: [81, 198, 198, 82]
console.log(Array.from(tok.encode('a  b')));
// Hugging Face reference: [81, 216, 278]
console.log(Array.from(tok.encode('x\n\n')));
// Hugging Face reference: [104, 1116] (trailing whitespace differs)
```

Compare exact IDs with `tokenizers.Tokenizer.from_file(...).encode(text, add_special_tokens=False).ids`, not merely encode/decode round trips. No generation is needed to expose this bug.

## Example fix and scope

Our [implementation and regression tests](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch#L369-L503) recognize this exact pre-tokenizer sequence, split individual Unicode numbers first, and apply byte-level boundaries before BPE. The whitespace negative lookahead is handled explicitly. Other tokenizer pipelines retain prior behavior; this is not a claim of general tokenizer.json support.

Our local recorded checks matched 47 independently generated original-tokenizer fixtures and 698 full evaluation prompts (119,802 token IDs) after the fix. The public STIX validation separately records 96 prompts / 22,938 matching IDs, and includes an [actual-WASM parity script](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/scripts/agent/check_parity.mjs). These results use the original JSON tokenizer; the embedded GGUF tokenizer is a separate path.

Closed #36 addressed byte-to-Unicode mapping; #329/#332 added edge cases. This report concerns pre-tokenizer boundaries and reference token-ID parity rather than those earlier fixes.

## Downstream implementation and validation

We run a patched Flare build in [STIX Meta Explorer](https://benjamin-small.github.io/stix-meta-explorer/). The publicly committed [patch set](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch) applies to `a8cb07cf54fa43c4e41664316498ed195fa7b018` (flare-web 0.2.21); its SHA-256 is `b50f6a694c85e2a74c8a4b9a7690ffa103db01d85eb8014a47e4a373f360b3e4`. This is a downstream patch set, not a standalone Flare fork or an upstream-ready PR. It contains several fixes; the relevant section is linked above.

[Validation notes](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent-validation.md) and [build/training instructions](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent.md) describe the tested scope. Measurements were recorded during September 8–9 development; this report is being filed September 21 after checking that upstream main is still at the same SHA. This report does not claim coverage of every model, quantization, or GPU.
