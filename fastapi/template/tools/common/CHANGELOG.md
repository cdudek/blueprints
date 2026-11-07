# Changelog

`common` is not a blueprint: it has no template and no architecture. It carries the parts every
blueprint vendors as `tools/common/`: the secrets CLI, the Terraform module, the Make contract and
the naming conventions. They are versioned together in `VERSION`.

The manifest (`secrets.manifest.json`) carries its own `schemaVersion`, independent of the release.

- Major: the manifest schema, a naming rule or a Make target changes in a way existing apps must
  migrate to.
- Minor: a new command, check or option; existing manifests keep working, new findings may appear.
- Patch: fixes that do not change what a correct app is told.

## 1.0.0

First release.

- Naming: `<repo>-<kind>-<env>` for every cloud resource, `<repo>-<purpose>-<env>` for secrets,
  UPPER_SNAKE env var names, and the regexes `secrets check` enforces.
- `secrets.manifest.json` (schema version 1) with a JSON Schema for editors.
- Secrets CLI for bash 3.2+: `list`, `check`, `env-names`, `set`, `rotate`, `retire`, `rename`,
  `rename-repo` and `dev-env`. GCP Secret Manager is the only backend.
- Terraform module: secret containers, labels, rotation notices, per-secret IAM, generated values
  through write-only arguments, and an env var map for Cloud Run.
- Make contract: `common.mk` and `secrets.mk`.
- Agent rules: `claude-settings.json` and `AGENTS.md`.
