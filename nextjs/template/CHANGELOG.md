# Changelog

The blueprint, its policy schema (`architecture.schema.json`) and its scripts
(`scripts/arch`, `scripts/quality`) are versioned together, so an app adopts a known release.
`architecture.json` carries `$schemaVersion`; the scripts refuse a different major version.

- Major: the policy file or a gate changes in a way existing apps must migrate to.
- Minor: a new rule or option; existing policy files keep working, new findings may appear.
- Patch: fixes that do not change what a correct app is told.

## 1.1.0

Minor release: a 1.0.0 `architecture.json` keeps working unchanged (every new key is optional and
defaults to 1.0.0 behaviour); new rules may report new findings.

### Policy

- `layout` (optional): where each folder lives, relative to `srcRoot` (`app`, `modules`, `ui`,
  `shared`, `db`, `clients`, `dbClient`, `schemaRoot`, `serverShared`, `resultFile`, `workflows`,
  `compositionFolders`, `worker`, `providers`). Defaults are the 1.0.0 paths.
- `sessionModule` (optional): the module that reads the session; the workflow check does not
  count it.
- `uiMayImport`, `iconPackages`, `bannedPackages` (optional): the packages `src/ui` may import,
  the icon packages behind `ui/icons`, and banned packages with their reasons.

### Rules

- New: `declared-edges-acyclic` (replaces the hard cycle test; one finding per edge, so it can
  be baselined), `shared-no-clients`, `shared-no-io`, `roots-no-modules`, `composition-folders`,
  `ui-leaf` (replaces `ui-no-modules` and `ui-no-server`), `providers-composed-once`,
  `icons-one-door`, `global-css-owners`, `doors-no-client-directive`, `banned-packages`,
  `stories-leaf`.
- Changed: `workflow-header` reads the header block, covers every file in `app/_workflows`, and
  refuses two workflows with the same answers. `system-operations-from-routes-only` accepts the
  worker and workflows (a workflow that calls a system operation is callable only from a route or
  the worker). `server-only-in-server-files` wants the marker as the first statement.
  `modules-declared` reports a role that selects no file. `roots-classified` says where a
  layer-first folder belongs. Client and browser-door closures stop at `"use server"` files.
  `system-operations-from-routes-only` also catches a user operation calling a system operation
  in its own file or from a sibling file of its module. `access-declared` also sees
  `const fn = ...; export { fn }`. `modules-declared` reports edges, table owners and
  `sessionModule` that still name a removed or renamed module.
- The access test loads every server door the policy declares instead of a hard-coded list, so a
  third module is checked without editing it.
- Failure messages name `file:line`.

### Tooling

- `pnpm arch:baseline:write`; `pnpm knip --write-baseline` and `pnpm dup --write-baseline`. A
  never-baselinable finding is never written.
- `arch:baseline`: a baseline absent at the merge base is adopted; an unreadable file or a git
  error fails closed; `quality/jscpd-exceptions.json` ratchets too; renames are verified against
  the merge base, a split may keep the source, and renames rewrite whole path fields. The base is
  `BASELINE_BASE_REF`, else `origin/HEAD`, else `origin/main`.
- jscpd keys use repo-relative paths. The diagram draws read exceptions from their file, labels
  edges "uses a door" and runs from any path. `policy-changes` lists renames and duplication
  exceptions, and never fails. CI never treats the diagram, `quality/` or the policy as docs-only.

### Template

- Layout: `tests/e2e`, `tests/integration`, `src/instrumentation.ts`, `src/worker.ts`
  (graphile-worker), `app/_workflows/payment-event.ts`, `/api/health`, a three-target
  `Dockerfile`, `services/README.md`, `infra/README.md`.
- The session moves to `modules/accounts`; `shared/auth.ts` keeps the type,
  `requireUser(session)` and `requireRole(session, role)`; user operations take the session as
  their first argument.
- UI: per-file `@/ui/<Component>` imports (no barrel), `ui/styles`, `ui/icons`, Tailwind v4 with
  semantic tokens and `cva`, `components.json` for shadcn, Storybook with the a11y addon, an axe
  smoke test, next-intl with English messages.
- Production refuses the `fixture` and `noop` payment providers unless `PAYMENTS_STUB=e2e` (the
  E2E run); a configuration-matrix test covers every combination. The cancel/refund job gives up an
  unlinked attempt with one compare-and-set, so a refund a webhook made necessary is never lost.
- The payments port's `cancelIntent` and `refund` take an idempotency key; the cancel/refund job
  derives it from the persisted attempt id (`<id>:cancel`, `<id>:refund`).
- Docs: one owner of commit and rollback per atomic use case; named intermediate states for
  multi-transaction processes; concurrency tests on separate connections; schema-compatible
  readiness and the full expand-to-contract sequence; agents work with fixtures, not credentials;
  what each rule detects, leaves to review and allows.
- Node 22.18 or later (graphile-worker and Node's type stripping).

### Migrating from 1.0.0

1. Copy `scripts/` and `tests/architecture/`; set `$schemaVersion` to `1.1.0`.
2. Run `pnpm arch`. If new rules report findings in an existing app, freeze them with
   `pnpm arch:baseline:write` in a reviewed commit on the default branch, then remove them.
3. If your folders differ from the defaults, add a `layout` block instead of editing the scripts.
4. Rename `ui-no-modules` and `ui-no-server` to `ui-leaf` in `exemptions` and baselines.
5. A user operation now takes the session as its first argument: read the session where the
   request is (a page, an action) and pass it in. Set `sessionModule` to the module that reads it.
6. If a deployed environment runs the `fixture` or `noop` payments provider under
   `NODE_ENV=production`, it now refuses to start: use the real provider, or set
   `PAYMENTS_STUB=e2e` only in the E2E job.
7. A payments provider you wrote implements `cancelIntent(providerRef, idempotencyKey)` and
   `refund(providerRef, idempotencyKey)` and sends the key to the vendor.

## 1.0.0

First release.

- Policy file `architecture.json` (doors with roles, edges, table owners, read exceptions for one
  file and one table, exemptions, clients, server-only packages, rules allowlist).
- Rules from three views: ArchUnitTS, a TypeScript-resolved graph, syntax rules.
- eslint-plugin-boundaries generated from the same file, with internal and unknown-file checks.
- Ratchets for knip and jscpd; per-occurrence baselines that only shrink.
- Template: orders and billing example with access policies, typed results, payment inbox,
  cancel and refund worker, transaction gateway.
