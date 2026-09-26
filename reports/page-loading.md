# Page loading repair

This records the earlier page-loading repair. The subsequent [Flare inference repair](flare-repair.md) resolves the numerical blocker mentioned below.

The original test runner shut down both local servers when it completed. There was no persistent `npm run dev` command, the root URL served a directory listing, and worker errors could leave an empty status. A failed report upload could also prevent the completion flag from being set.

The persistent launcher now starts and checks both local servers, logs their output to files, and keeps them running until stopped. The root URL redirects to the diagnostic page. The page checks assets and the local reference automatically, defaults to the original tokenizer, reports loading stages and byte progress, allows cancellation, and explicitly labels a failed correctness gate. Worker startup errors and request timeouts are visible; saving a report is independent of displaying a result.

Verified on 2026-09-08:

- Python compilation and JavaScript syntax checks passed.
- HTTP checks passed for the root redirect, ready status, JavaScript/CSS/WASM assets, reference tokenization proxy, and structured rejection of an invalid report.
- A real browser run in the Codex in-app Chromium browser completed all three GPU comparisons. It reported WebGPU and zero nonzero logits, with 0/3 expected answers; the page displayed the failure and saved its evidence.
- Stop terminated a CPU diagnostic and re-enabled the run controls.
- Temporarily blocking the setup request produced visible startup instructions and disabled generation. The test restriction was removed; reloading restored the ready state.
- The ready page was visually inspected and left open with both servers running.

This validates the page repair. It does not resolve Flare's inference error or complete the planned chat application. The earlier installed-Chrome inference findings remain in `runtime-proof.md`.
