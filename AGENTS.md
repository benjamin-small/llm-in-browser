# Agent instructions

## Purpose

Make focused, reviewable changes to llm-in-browser. Preserve existing behavior unless the issue or pull request explicitly authorizes a change.

## Setup

```sh
npm ci
```

## Validation

```sh
npm run test
npm run build
```

## Constraints

- Do not commit credentials, generated secrets, or local environment files.
- Keep documentation and tests synchronized with behavior changes.
- Do not overwrite unrelated work in a dirty working tree.
