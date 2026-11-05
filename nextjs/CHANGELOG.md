# Changelog

The blueprint, its policy schema (`architecture.schema.json`) and its scripts
(`scripts/arch`, `scripts/quality`) are versioned together, so an app adopts a known release.
`architecture.json` carries `$schemaVersion`; the scripts refuse a different major version.

- Major: the policy file or a gate changes in a way existing apps must migrate to.
- Minor: a new rule or option; existing policy files keep working, new findings may appear.
- Patch: fixes that do not change what a correct app is told.

## 1.0.0

First release.

- Policy file `architecture.json` (doors with roles, edges, table owners, read exceptions for one
  file and one table, exemptions, clients, server-only packages, rules allowlist).
- Rules from three views: ArchUnitTS, a TypeScript-resolved graph, syntax rules.
- eslint-plugin-boundaries generated from the same file, with internal and unknown-file checks.
- Ratchets for knip and jscpd; per-occurrence baselines that only shrink.
- Template: orders and billing example with access policies, typed results, payment inbox,
  cancel and refund worker, transaction gateway.
