# Contributing

Open an issue before substantial changes so scope and expected behavior are clear. Keep pull requests focused and include tests or documentation for changed behavior.

## Local setup

Use Node 26, Python 3.11 or newer, and Cargo. The Pages build uses a pinned,
checksum-verified release bundle; see README.md for runtime source setup.

```sh
npm ci
cargo fetch --manifest-path crates/station-core/Cargo.toml --locked
```

## Validation

Run the checks that apply before opening a pull request:

```sh
npm run test
npm run check
npm run build:pages
python3 scripts/check_pages.py
```
