# Next.js blueprint

A modular-monolith architecture for Next.js App Router applications, with a runnable template that
carries every rule as code.

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) is the blueprint: the principles, the rules, the reasons,
  decisions D1 to D30, the enforcement table and the coverage matrix. It is the single source of truth for the rules.
- [`template/`](./template) is a working project that follows it. Copy it to start an app.

Every decision in `ARCHITECTURE.md` is implemented in the template, or marked below as
documentation only.

## Start a new app

```bash
cp -R nextjs/template my-app
cd my-app
nvm use
pnpm install
cp .env.example .env
pnpm check
```

`pnpm check` runs everything CI runs: format, lint, typecheck, unit tests, architecture tests, the
baseline-shrink check, knip, jscpd, a production build and the Playwright smoke test. The tests use
an in-process Postgres (PGlite) by default. Set `TEST_DATABASE_URL` to use a real Postgres, and
`DATABASE_URL` for the end-to-end run (see `.env.example`).

Then:

1. Replace the example modules. `pnpm new:module <name>` scaffolds a module with both doors, a
   service, repository, rules with a test, tables, a schema, a component and its entry in
   `architecture.json`. Delete `orders` and `billing` when you no longer need them as a reference.
2. Read `docs/worked-slice.md`. It lists the failure cases the example handles, the test for each,
   and what the example does **not** implement.
3. Keep the module-level `CLAUDE.md` in the template root. It tells an agent the rules in one page.

Prisma works the same way as drizzle here: keep each module's models behind its repository, record
the owner of every model in `architecture.json`, and replace the table-definition check with a check
over your schema file. Nothing else in the blueprint depends on the ORM.

## What is in the template

```text
architecture.json            the policy: doors, modules, edges, table owners, exceptions, layout, UI packages
architecture.schema.json     its JSON Schema (versioned together with the scripts)
Dockerfile                   three targets: web (standalone), worker, migrate
messages/en.json             every user-visible string, English by default
components.json              the shadcn CLI, pointed at src/ui
.storybook/                  Storybook for src/ui, with the a11y addon
scripts/arch/                eslint config generator, Mermaid diagram generator, module generator
scripts/quality/             knip and jscpd ratchets, baseline writer and tools, policy-change report, CI path filter
tests/architecture/          the rules (ArchUnitTS plus a resolved graph), fixtures, eslint tests
tests/e2e/                   Playwright: smoke and axe over every page, against the production build
tests/integration/           tests across modules or a process entry point (the worker)
tests/fixtures/              deliberate-violation projects, one per rule family, and a 1.0.0 policy
tests/tooling/               tests for the scripts and the worked slice
quality/                     baselines and reviewed exceptions (empty in a greenfield app)
services/README.md           how another runtime (a Python service) joins the app
infra/README.md              when infrastructure as code lives here
src/proxy.ts                 locale routing and headers; imports no module
src/instrumentation.ts       error logging with the trace id; OpenTelemetry starts here
src/worker.ts                the worker process: graphile-worker calling job operations
src/i18n/                    next-intl routing, request config and navigation
src/modules/                 accounts (the session), orders and billing, the example modules
src/clients/payments/        a third-party port with real, fixture and noop providers
src/db/                      the database client, transactions and the schema composition root
src/shared/                  the session type, access policies, results, env
src/ui/                      this project's own design system: primitives, icons, styles, stories
src/app/                     [locale] pages, an action, a workflow, webhook, cron and health routes
drizzle/                     migrations, including a reviewed custom foreign-key migration
.github/workflows/ci.yml     check matrix, e2e, worker check, Docker smoke, quality report, aggregate job
.husky/                      pre-commit (lint-staged on staged files) and pre-push (pnpm check)
```

### Config files, one line each

- `eslint.config.mjs`: loads the generated boundaries config and the unused-directive rules. Never edit
  the generated part by hand; run through `scripts/arch/eslint-boundaries.mjs`. `tests/architecture/eslint.test.ts` fails if the
  config is stale or does not flag the fixtures.
- `knip.json`: entries (the doors and Next.js file conventions), the test graph and ignores.
- `.jscpd.json`: duplication threshold (50 tokens, 5 lines), ignored folders, report format.
- `vitest.config.ts`, `vitest.arch.config.ts`, `vitest.report.config.ts`: unit and integration, the
  architecture suite, and the metrics and graph report.
- `tsconfig.json`, `tsconfig.arch.json`: strict TypeScript for the app and the project used by the
  architecture graph.
- `drizzle.config.ts`: reads every `*.tables.ts`, so it cannot drift from `src/db/schema.ts`.
- `playwright.config.ts`: builds and starts the production server with the e2e-only auth stub and
  the fixture payments provider.
- `.lintstagedrc.json`, `.husky/`: staged-files-only checks before commit, the full check before push.
- `.nvmrc`, `.prettierrc.json`, `.gitignore`, `.env.example`: housekeeping.

## Decisions D1 to D30

Each row names the file that implements the decision and the check that enforces it. Rows marked
**documentation only** have no mechanical check; the coverage matrix in `ARCHITECTURE.md` section 13
says which parts of each rule are review obligations.

| #   | Decision                                                                            | Implemented in                                                                                                | Enforced by                                                                                           |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1  | Modular monolith: service, repository, rules per module                             | `src/modules/orders`, `src/modules/billing`, `scripts/arch/new-module.mjs`                                    | `module-doors-complete`, `modules-declared`; `tests/tooling/new-module.test.ts`                       |
| D2  | No database port; concrete private repositories                                     | `src/modules/*/*.repository.ts`                                                                               | door-exports and eslint private-file policies; fixtures for a repository leaked through a door        |
| D3  | eslint-boundaries (editor) + ArchUnitTS and resolved graph (CI), one source         | `scripts/arch/eslint-boundaries.mjs`, `tests/architecture/{rules,graph,ast}.ts`                               | `tests/architecture/eslint.test.ts` (stale config, specific diagnostics); `architecture.test.ts`      |
| D4  | knip and jscpd ratchets with reviewed exceptions                                    | `scripts/quality/{knip,jscpd}-ratchet.mjs`, `knip.json`, `.jscpd.json`, `quality/*`                           | `pnpm knip`, `pnpm dup`; `tests/tooling/gates.test.ts` against `tests/fixtures/{knip,dup}-violation`  |
| D5  | One policy file generates the rules                                                 | `architecture.json`, `architecture.schema.json`, `scripts/arch/lib.mjs`                                       | schema validation and version check in `lib.mjs`; the generated eslint config is tested for staleness |
| D6  | Pure rules in `<x>.rules.ts`                                                        | `order.rules.ts`, `billing.rules.ts` with unit tests                                                          | `rules-pure-closure`, `rules-pure-content`; fixtures with an impure helper                            |
| D7  | One owner per table; reads through the owner or exact exceptions; foreign keys kept | `*.tables.ts`, `src/db/schema.ts`, `drizzle/0001_payments-order-fk.sql`                                       | `table-definitions-declared`, `schema-composition`, `read-exceptions-exact`; foreign-key test         |
| D8  | Coupling metrics report only                                                        | `tests/report/report.test.ts`, `vitest.report.config.ts`                                                      | report artifact in CI (`quality-report` job); no gate by design                                       |
| D9  | Two doors with roles: `server.ts` and `public.ts`                                   | `src/modules/*/{server,public}.ts`; `doors` in `architecture.json`                                            | `door-exports`, `public-door-closure`, `server-only-in-server-files`; fixtures                        |
| D10 | Flat modules; purity and UI/persistence separation                                  | module folder layout; `src/ui`                                                                                | `ui-leaf`, `components-no-persistence`, `rules-pure-closure`                                          |
| D11 | Declared acyclic edges, for both doors                                              | `edges` in `architecture.json`                                                                                | `declared-edges-complete`, `no-cycles-complete` (re-export cycles included); fixtures                 |
| D12 | Baselines per occurrence; may only shrink; leaks never baselined                    | `quality/*.json`, `scripts/quality/{baseline,baseline-shrinks,baseline-rename}.mjs`                           | `pnpm arch:baseline` (merge base, fails closed in CI); `gates.test.ts`; eslint admission test         |
| D13 | Pilot, then reuse through the template                                              | `ARCHITECTURE.md` section 19, `CHANGELOG.md`                                                                  | **documentation only**, plus the version check between policy file and scripts                        |
| D14 | Named workflows with a four-question header; durable intent                         | `src/app/_workflows/payment-event.ts`, `payment_inbox`, `src/worker.ts`, `src/app/api/cron/payments/route.ts` | `workflow-header`; worked-slice tests (duplicate, out of order, before linkage, worker)               |
| D15 | Thin actions; an access policy per operation; typed failures                        | `src/shared/access.ts`, `src/modules/accounts`, `src/app/[locale]/orders/actions.ts`                          | `src/shared/access.test.ts`, `system-operations-from-routes-only`, `access-declared` diagnostic       |
| D16 | Pass a typed `Tx` for DB-only cross-module writes; never external calls inside      | `src/db/index.ts` (`Tx`, `inTransaction`), `order.service.ts`                                                 | `transaction-discipline`; the `Tx` type is a compile-time check; callee use of `tx` is review         |
| D17 | Each project owns its UI (`src/ui`)                                                 | `src/ui/*`, `src/ui/styles/theme.css`, `modules/*/components`                                                 | `ui-leaf`, `components-no-persistence`; the placement test itself is **documentation only**           |
| D18 | The policy file is the architecture description; diagrams generated                 | `scripts/arch/diagram.mjs`, `docs/architecture.md`                                                            | `pnpm arch:diagram:check` (inside `pnpm arch`)                                                        |
| D19 | A worker process on a Postgres queue                                                | `src/worker.ts`, `tests/integration/worker.test.ts`, the `worker` Docker target                               | `system-operations-from-routes-only`; `pnpm worker:check`                                             |
| D20 | Workflows in `app/_workflows`, header block, no copies                              | `src/app/_workflows/payment-event.ts`                                                                         | `workflow-header`                                                                                     |
| D21 | Composition folders take `src/ui`, browser doors and props                          | `src/app/**/_shell`, `src/app/**/_components`                                                                 | `composition-folders`                                                                                 |
| D22 | The session in a module, passed to operations                                       | `src/shared/auth.ts`, `src/modules/accounts`, `sessionModule`                                                 | `shared-no-io`, `shared-no-clients`, `src/shared/access.test.ts`                                      |
| D23 | An optional `layout` block                                                          | `scripts/arch/lib.mjs` (`layoutOf`), `architecture.schema.json`                                               | `tests/architecture/layout.test.ts`                                                                   |
| D24 | Colocated unit tests                                                                | `src/**/*.test.ts`                                                                                            | **documentation only**                                                                                |
| D25 | `src/ui` a leaf, per-file public path, no layer-first folders                       | `src/ui/*`, `uiMayImport`                                                                                     | `ui-leaf`, `roots-classified`                                                                         |
| D26 | Tailwind v4, `cva`, shadcn layout, Radix                                            | `src/ui/styles`, `src/ui/lib/cn.ts`, `components.json`                                                        | `global-css-owners`; the styling choice itself is **documentation only**                              |
| D27 | Providers once, nav in the shell, one icon door                                     | `src/app/_shell`, `src/ui/icons`                                                                              | `providers-composed-once`, `icons-one-door`                                                           |
| D28 | i18n from the first commit, English by default                                      | `messages/en.json`, `src/i18n`, `src/app/[locale]`                                                            | `copy-from-messages`; typed keys in `tsc`                                                             |
| D29 | axe and Storybook in the template                                                   | `tests/e2e/a11y.spec.ts`, `.storybook/`, `src/ui/*.stories.tsx`                                               | `pnpm e2e`, `pnpm storybook:test`                                                                     |
| D30 | Banned packages with reasons                                                        | `bannedPackages`                                                                                              | `banned-packages`                                                                                     |

## Brownfield adoption

1. Copy `architecture.json`, the schema, `scripts/`, `tests/architecture/`, `knip.json`,
   `.jscpd.json` and the CI jobs into the existing repo. Adjust `srcRoot`, `modules` and `tables`.
   If the folders differ from the template (`src/features` instead of `src/modules`), say so in
   the `layout` block rather than editing the scripts.
2. Freeze today's violations in a reviewed commit on the default branch:
   `pnpm arch:baseline:write`, `pnpm knip --write-baseline`, `pnpm dup --write-baseline`. Every
   existing violation, including those of the non-negotiable rules, becomes one line in
   `quality/arch-baseline.json`; a baseline that did not exist at the merge base counts as
   adopted. The same file turns the matching eslint policies into exact file-to-file allowances,
   so the editor stays quiet only for debt you approved.
3. From then on, additions fail; fixing a violation deletes its line; a line whose violation is
   gone fails as stale. A baseline can only shrink (`pnpm arch:baseline`, compared with the merge
   base of `BASELINE_BASE_REF`, else the remote's default branch). An unreadable baseline fails
   closed.
4. Moving a file that has baselined findings goes through `scripts/quality/baseline-rename.mjs`,
   which rewrites whole path fields and records the move in `quality/baseline-renames.json`. A
   recorded move counts only when its source existed at the merge base and its destination did
   not. Splitting a file (the source stays) is recorded the same way: each line may stay with the
   source or move to the new file, once. An unexplained rename counts as a new violation.
5. Never baselinable, even here: client code reaching server code or secrets
   (`client-runtime-closure`, `public-door-closure`, `server-only-in-server-files`).
   `arch:baseline:write` lists such findings and fails instead of writing them.
6. Migrate in this order: doors, rules files, data ownership, workflows. Move one vertical slice at
   a time.

## Running it

Build one image per commit and promote it unchanged: the `Dockerfile` builds a standalone `web`
target, a `worker` target for background jobs and a `migrate` target that runs once before the
traffic shift (expand/contract migrations only). Every instance shares one
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and the build pins `deploymentId`. Public configuration is
read at runtime, logs are JSON lines with the trace id, `/api/health` answers liveness, and a
container service is enough until several services need Kubernetes. A schema change runs
expand, old and new in parallel, switch, stop the old web and worker, rollback window, contract;
readiness checks that the schema is compatible, not that it is at the latest migration. Jobs call
providers with idempotency keys derived from persisted ids. Agents build and test with fixture
providers; real credentials live only in a separate, limited context. `ARCHITECTURE.md` section
12 has the details.

## Limitations

What the tools cannot do, so you do not rely on them for it.

**ArchUnitTS**

- Its graph is built from top-level imports. It misses re-export-only cycles and literal dynamic
  imports, so the template builds a second graph through the TypeScript compiler and runs the
  cycle, closure and door rules on it.
- File content rules read paths relative to the current directory; the template reads files itself
  from the analysed root.
- A selection that matches no file passes silently. The template asserts that every role selection
  is non-empty in the real tree and in each fixture.
- Its metrics (coupling, instability) are import-based; treat them as a report, not a gate.

**knip**

- It reasons about exports and entries, not about behaviour. In a template, anything used only by a
  test or by a framework convention needs an entry or an `@public` tag, otherwise it is reported.
  The doors are configured as entries.
- Dynamic or computed imports are invisible to it.
- The template keys findings as `file:type:name` and compares them with a baseline; a knip upgrade
  that renames finding types should be applied in its own PR that regenerates the baseline.

**jscpd**

- Detection is token-based and tuned by `.jscpd.json`; fingerprints use the two files plus a hash of
  the normalised fragment, so line shifts do not create new findings but an edit inside a clone does.
- Intentional duplication goes into `quality/jscpd-exceptions.json` with a reason.

**The blueprint itself**

- It proves structure, not correctness. What no check proves is listed as a review obligation in the
  coverage matrix: a callee given `tx` really uses it, isolation levels, raw SQL that writes another
  module's table without importing its definition, and the truth of a workflow header.
- Purity of rules is checked by imports, closure and a list of ambient globals, not by analysis of
  arbitrary JavaScript.
- Versions are pinned in `package.json` (Node 22.18 or later, TypeScript 6.0.3). TypeScript 7 was not tried.

## Versioning

The blueprint, the JSON Schema and the scripts share one version, recorded in
`template/CHANGELOG.md`. `architecture.json` carries `$schemaVersion`; the scripts refuse another
major version. To upgrade an app, copy the new `scripts/` and `tests/architecture/`, follow the
changelog and run `pnpm check`.
