# Configuration

The published application runs inference in the browser without an inference
API key. A normal demo build uses Node 26, Python 3.11 or newer, and the pinned
release bundle; runtime source builds and training need additional toolchains
described in the README and [training guide](training.md).

## Reproducible inputs

- `pages-assets.lock.json` pins the published bundle URL, byte counts, file
  checksums, and source hashes. `npm run build:pages` validates these before
  installing assets and builds with the `/llm-in-browser/` base path.
- `runtime-lock.json` and `runtime-assets.lock.json` record source/model
  revisions and downloaded asset checksums for source setup.
- `training/config.json` defines local training settings, including seed,
  LoRA parameters, data paths, and checkpoint output. See the training guide
  before changing or promoting trained artifacts.
- `public/models/registry.json` and the model manifests describe model
  choices. The Pages build installs the verified tuned-Q4 release selection.

## Local servers and browser state

`npm run preview` serves the built Pages site on `127.0.0.1:8795` under
`/llm-in-browser/`. The full runtime lab uses `npm run dev` on port 8787 and
binds all IPv4 interfaces by default. Pass `-- --host 127.0.0.1` to restrict
it to this computer. The runtime proof owns ports 8787 and 8788 temporarily;
stop the development server before running it.

The browser stores the selected model and imported graph in `localStorage`
under `aster-model` and `aster-graph`. Application assets and verified model
files use browser caches, subject to storage availability and eviction.
Loading model weights is an explicit user action. See the README for memory
requirements, model imports, and source-build setup.
