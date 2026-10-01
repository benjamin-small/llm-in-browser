# Agent instructions

## Purpose

Make focused, reviewable changes to llm-in-browser. Preserve existing behavior unless the issue or pull request explicitly authorizes a change.

## Setup

```sh
npm ci
cargo fetch --manifest-path crates/station-core/Cargo.toml --locked
```

## Validation

```sh
npm run test
npm run check
npm run build:pages
python3 scripts/check_pages.py
```

## Constraints

Use Node 26 and Python 3.11 or newer. The Pages build downloads the pinned,
checksum-verified release bundle. The separate source build (`npm run build`)
requires the runtime assets and toolchain described in README.md.

- Do not commit credentials, generated secrets, or local environment files.
- Keep documentation and tests synchronized with behavior changes.
- Do not overwrite unrelated work in a dirty working tree.
