# Testing

## Automated test scope

`npm test` runs three separate checks:

- Node tests in `tests/*.test.ts` exercise GPU initialization failures and CPU
  fallback, explicit CPU selection, mobile and reported low-memory blocking,
  prompt/history budgets, evidence truncation, oversized requests, and chat
  template delimiter handling. The prompt tests use a deterministic mock
  encoder rather than the model tokenizer.
- `scripts/test_data.py` checks held-out training entities, evaluation wording,
  numeric matching, and event grading. These tests validate dataset boundaries
  and grading behavior, not model quality.
- `npm run test:rust` runs the native `station-core` tests using locked, offline
  dependencies. Fetch them once before testing a fresh checkout.

## Clean-checkout validation

Use Node 26, Python 3.11 or newer, and Cargo:

```sh
npm ci
cargo fetch --manifest-path crates/station-core/Cargo.toml --locked
npm test
npm run check
npm run build:pages
python3 scripts/check_pages.py
```

The PR workflow uses this path with Python 3.12. The Pages build downloads the
pinned release bundle and verifies its checksums and source hashes. It does
not rebuild or retrain the model. `check_pages.py` validates packaged assets
and deployment paths; it does not execute browser inference.

The separate `npm run build` source path needs wasm-pack and prepared runtime
assets. Follow the README's source-build instructions before using it.

## Runtime and quality verification

Browser inference, GPU decoding, tokenizer parity, trained-model quality, and
offline behavior need the additional runtime and browser procedures described
in the README and existing reports. Historical report results are not fresh
PR results. Passing the unit tests or packaging checks does not establish
current browser performance or model accuracy. No new whole-project coverage
percentage is claimed by this document.
