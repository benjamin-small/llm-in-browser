## Reproduction

At `a8cb07c`, with wasm-bindgen 0.2.117:

```sh
wasm-pack build flare-web --target web --release
node --check flare-web/pkg/flare_web.js
```

The generated JavaScript fails syntax validation. The [Rust documentation example](https://github.com/sauravpanda/flarellm/blob/a8cb07cf54fa43c4e41664316498ed195fa7b018/flare-web/src/lib.rs#L1771) contains:

```rust
///   if (id === undefined) { /* done */ return; }
```

wasm-bindgen emits that example inside a JavaScript block comment; the nested `*/` terminates it early, leaving example text parsed as JavaScript. The module cannot be imported, before inference starts.

## Example fix

Our [one-line change](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch#L1-L12) removes the inner block comment, retaining `if (id === undefined) { return; }`. The regenerated module passes `node --check` and imports successfully. Please add generated-JS syntax/import validation to the WASM build checks (related #521). This observation is specific to the recorded wasm-bindgen version; it does not establish behavior across all versions.

## Downstream implementation and validation

We run a patched Flare build in [STIX Meta Explorer](https://benjamin-small.github.io/stix-meta-explorer/). The publicly committed [patch set](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/patches/flare-smollm2.patch) applies to `a8cb07cf54fa43c4e41664316498ed195fa7b018` (flare-web 0.2.21); its SHA-256 is `b50f6a694c85e2a74c8a4b9a7690ffa103db01d85eb8014a47e4a373f360b3e4`. This is a downstream patch set, not a standalone Flare fork or an upstream-ready PR. It contains several fixes; the relevant section is linked above.

[Validation notes](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent-validation.md) and [build/training instructions](https://github.com/benjamin-small/stix-meta-explorer/blob/b86a73eddfae8a5603c49e5ade8af760bc84048c/docs/stix-agent.md) describe the tested scope. Measurements were recorded during September 8–9 development; this report is being filed September 21 after checking that upstream main is still at the same SHA. This report does not claim coverage of every model, quantization, or GPU.
