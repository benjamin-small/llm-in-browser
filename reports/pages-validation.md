# Pages packaging validation · 2026-09-26

The production build was served under `/llm-in-browser/` and tested in desktop Chromium.

- Initial page: explicit Load model button; no automatic model initialization.
- Tuned Q4 bundle loaded successfully; original tokenizer and matching WASM used.
- Question: “Who is the director of Aster?” Answer: “Mira Vale.”
- GPU decoding independently verified with finite, nonzero logits.
- 183 input tokens, 5 output tokens, EOS completion.
- First token: 2.39 seconds; decode: 21.7 tokens/second.
- Weight file: 229.1 MB; observable WASM heap: 1,891 MB, excluding GPU/JavaScript.
- Seven TypeScript tests, four dataset tests and three Rust tests passed.
- Pages artifact checks verify every release member hash, base paths, portable manifest paths, and exclusion of weights/tokenizer from service-worker precaching.

These measurements describe one local desktop run, not phone support or a hardware-independent benchmark. Phones/tablets and browsers reporting at most 4 GB RAM are blocked before loading. Unknown memory is not evidence that loading is safe.
