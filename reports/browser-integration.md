# Browser integration checks

Executed against the local app using its real UI in the Codex in-app Chromium browser on the Apple M5 Max Mac. Browser automation used CUA; native evaluation results are recorded separately.

| Check | Observed outcome |
|---|---|
| Automatic model loading | Verified Q8 weights and original tokenizer loaded; controls enabled without a diagnostic button |
| WebGPU inference | Correct oxygen-sensor location and station-director answers; GPU-resident weights/cache and finite, nonzero decode logits |
| Streaming and repeated turns | Replies streamed; follow-up retained the entity. The base model picked an incorrect related owner, a quality failure recorded during development |
| CPU selection | Local CPU/WASM produced the correct director answer after reloading |
| Stop during prefill | Worker terminated promptly; explicit reload message appeared; selecting CPU recovered successfully |
| New chat | Conversation cleared and starter suggestions returned |
| Oversized request | A 2,500-word request was rejected before inference; Send became usable again |
| Invalid graph | Missing entity reference rejected with fact ID; previous graph remained available |
| Valid graph and restore | Custom graph name appeared; Restore starter graph returned Aster and its 100 entities/500 facts |
| Incomplete model bundle | Missing GGUF reported by filename; reselecting the base model recovered |
| Offline reload and answer | With CDP network emulation set offline, the app reloaded from cache, reinitialized WebGPU and answered the director question correctly |
| Requests during an event | Page request trace recorded zero requests while the event was processed; worker source permits only same-origin file reads, and offline generation worked |
| Unavailable GPU | Failure/missing-adapter branches tested with injected engine results in unit tests; real CPU inference tested in-browser. Physical GPU absence was not available on this machine |

Network emulation was restored after the offline check. Test graph changes were restored. No external deployment or message sending occurred.

One observed base Q8 browser sample (director question, five supplied facts) used 182 input/11 output tokens, 2.38 seconds to the first token, 24.6 decoded tokens/s, 386.4 MB of weights and a 2,013 MB Flare WASM heap. This is one sample, not a benchmark distribution. The heap excludes JavaScript, the separate retrieval module and GPU allocations. The runtime still allocates cache capacity beyond the app's 2,048-token input/output budget.

Unit tests separately check whole-turn context trimming, evidence trimming, rejection of oversized current requests, role-delimiter escaping, event immutability, duplicate/missing graph IDs and data split isolation. The page request trace does not independently capture every worker-internal request; the local-only conclusion also relies on source review and successful offline inference.

## Final trained artifacts (aster-1.2.0)

The current Q4 and Q8 weights and the final Flare patch are identified by hash in [browser-tuned.json](browser-tuned.json). The full rendered prompts, Rust retrieval results and token IDs separately match the native reference for 698 cases; that WASM library check is distinct from these real-browser generation samples.

- Both GPU variants answered “What room contains Nico?” with “Room R-09.” and 278 input tokens, matching the native reference. Q8 also matched the unknown warranty-identifier answer (272 input tokens).
- Q4 answered “Where is the oxygen sensor?” with “Room R-01.” and the subsequent “Who owns it?” with “Mira Vale.” Version 1.1 had abstained on the ordinary location question; that failed run is preserved separately.
- All three Q4 UI presets returned the expected entity and payload values. The stock preset reported two packs from the event, rather than 17 from the graph. This does not imply perfect handling of unseen payloads: the wider native event test scored 15/18 for Q4 and 17/18 for Q8.
- A complete exported Q8 bundle was selected through the browser file chooser and generated the expected answer. Cached verified model bytes may be reused; this check does not claim that every selected byte was freshly read from disk.
- Q4 CPU/WASM produced the correct unknown-answer response. A 1,086-token CPU prefill was stopped; the worker terminated and Retry was available.

For the same six-token Nico answer, Q4 took 3.68 seconds to the first token and decoded at 16.8 tokens/s; Q8 took 3.66 seconds and 17.0 tokens/s. Q4's device-alert sample decoded 16 tokens at 18.3 tokens/s after 3.77 seconds to the first token. The observed heaps were 1,891 MB (Q4) and 2,013 MB (Q8). These are individual runs with UI-rounded measurements, not a benchmark distribution. CPU Q4's nine-token uncertainty answer took 3.42 seconds to the first token and decoded at 28.4 tokens/s; this GPU implementation is not automatically faster than CPU for tiny models and short outputs.

The worker now uses MessageChannel task yielding to remain cancellable without timer throttling between tokens. Q4 is expanded losslessly into Q8 storage for CPU prefill and GPU decoding. The expanded tokenizer check found and repaired ignored pre-tokenizer boundaries; the earlier short runtime smoke tests had missed that issue. No full browser regression sweep across all 251 quality questions is claimed.

Final recovery/offline check: Retry restored enabled chat controls after the long-prefill cancellation. The final application build and tuned Q4 were then reloaded with browser networking disabled. WebGPU initialization succeeded from cached files and “What is Nico Ames’s warranty identifier?” returned “I do not know from the available facts.” with 272 input tokens, 3.61 seconds to the first token and 18.1 tokens/s. Normal networking was restored afterward. The final starter graph is version 1.2 and the earlier intentionally incomplete imported-model fixture was replaced by the valid Q8 bundle.
