# Releases

Release notes should summarize user-visible changes, upgrade steps, and
breaking changes. This guidance does not establish a semantic-versioning
commitment or release cadence.

Before a release, run the repository's documented validation commands, confirm generated artifacts are current, and verify the release from a clean checkout.

The README describes the existing Pages release-bundle process. Publish the
validated archive before pushing its updated lockfile, and never overwrite an
asset referenced by an existing lockfile. Preserve the model/runtime checksums,
source hashes, and third-party license files.
