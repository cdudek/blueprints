# Next.js blueprint

A modular-monolith architecture for Next.js App Router applications, with a runnable template that
carries every rule as code.

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) is the blueprint: the rules, the reasons, decisions D1 to D18,
  the enforcement table and the coverage matrix. It is the single source of truth for the rules.
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
architecture.json            the policy: doors, modules, edges, table owners, exceptions
architecture.schema.json     its JSON Schema (versioned together with the scripts)
scripts/arch/                eslint config generator, Mermaid diagram generator, module generator
scripts/quality/             knip and jscpd ratchets, baseline tools, policy-change report
tests/architecture/          the rules (ArchUnitTS plus a resolved graph), fixtures, eslint tests
tests/fixtures/              deliberate-violation projects, one per rule family
tests/tooling/               tests for the scripts and the worked slice
quality/                     baselines and reviewed exceptions (empty in a greenfield app)
src/modules/                 orders and billing, the example modules
src/clients/payments/        a third-party port with real, fixture and noop providers
src/db/                      the database client, transactions and the schema composition root
src/shared/                  auth, access policies, results, env
src/ui/                      this project's own design system
src/app/                     routes, a Server Action, a webhook route, a cron route
e2e/                         Playwright smoke test against the production build
drizzle/                     migrations, including a reviewed custom foreign-key migration
.github/workflows/ci.yml     check matrix, e2e, quality report, aggregate job
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

## Decisions D1 to D18

Each row names the file that implements the decision and the check that enforces it. Rows marked
**documentation only** have no mechanical check; the coverage matrix in `ARCHITECTURE.md` section 11
says which parts of each rule are review obligations.

| #   | Decision                                                                            | Implemented in                                                                                  | Enforced by                                                                                           |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1  | Modular monolith: service, repository, rules per module                             | `src/modules/orders`, `src/modules/billing`, `scripts/arch/new-module.mjs`                      | `module-doors-complete`, `modules-declared`; `tests/tooling/new-module.test.ts`                       |
| D2  | No database port; concrete private repositories                                     | `src/modules/*/*.repository.ts`                                                                 | door-exports and eslint private-file policies; fixtures for a repository leaked through a door        |
| D3  | eslint-boundaries (editor) + ArchUnitTS and resolved graph (CI), one source         | `scripts/arch/eslint-boundaries.mjs`, `tests/architecture/{rules,graph,ast}.ts`                 | `tests/architecture/eslint.test.ts` (stale config, specific diagnostics); `architecture.test.ts`      |
| D4  | knip and jscpd ratchets with reviewed exceptions                                    | `scripts/quality/{knip,jscpd}-ratchet.mjs`, `knip.json`, `.jscpd.json`, `quality/*`             | `pnpm knip`, `pnpm dup`; `tests/tooling/gates.test.ts` against `tests/fixtures/{knip,dup}-violation`  |
| D5  | One policy file generates the rules                                                 | `architecture.json`, `architecture.schema.json`, `scripts/arch/lib.mjs`                         | schema validation and version check in `lib.mjs`; the generated eslint config is tested for staleness |
| D6  | Pure rules in `<x>.rules.ts`                                                        | `order.rules.ts`, `billing.rules.ts` with unit tests                                            | `rules-pure-closure`, `rules-pure-content`; fixtures with an impure helper                            |
| D7  | One owner per table; reads through the owner or exact exceptions; foreign keys kept | `*.tables.ts`, `src/db/schema.ts`, `drizzle/0001_payments-order-fk.sql`                         | `table-definitions-declared`, `schema-composition`, `read-exceptions-exact`; foreign-key test         |
| D8  | Coupling metrics report only                                                        | `tests/report/report.test.ts`, `vitest.report.config.ts`                                        | report artifact in CI (`quality-report` job); no gate by design                                       |
| D9  | Two doors with roles: `server.ts` and `public.ts`                                   | `src/modules/*/{server,public}.ts`; `doors` in `architecture.json`                              | `door-exports`, `public-door-closure`, `server-only-in-server-files`; fixtures                        |
| D10 | Flat modules; purity and UI/persistence separation                                  | module folder layout; `src/ui`                                                                  | `ui-no-server`, `components-no-persistence`, `rules-pure-closure`                                     |
| D11 | Declared acyclic edges, for both doors                                              | `edges` in `architecture.json`                                                                  | `declared-edges-complete`, `no-cycles-complete` (re-export cycles included); fixtures                 |
| D12 | Baselines per occurrence; may only shrink; leaks never baselined                    | `quality/*.json`, `scripts/quality/{baseline,baseline-shrinks,baseline-rename}.mjs`             | `pnpm arch:baseline` (merge base, fails closed in CI); `gates.test.ts`; eslint admission test         |
| D13 | Pilot, then reuse through the template                                              | `ARCHITECTURE.md` section 17, `CHANGELOG.md`                                                    | **documentation only**, plus the version check between policy file and scripts                        |
| D14 | Named workflows with a four-question header; durable intent                         | `src/app/api/webhooks/payments/route.ts`, `payment_inbox`, `src/app/api/cron/payments/route.ts` | `workflow-header`; worked-slice tests (duplicate, out of order, before linkage, worker)               |
| D15 | Thin actions; an access policy per operation; typed failures                        | `src/shared/access.ts`, `src/shared/auth.ts`, `src/app/orders/actions.ts`                       | `src/shared/access.test.ts`, `system-operations-from-routes-only`, `access-declared` diagnostic       |
| D16 | Pass a typed `Tx` for DB-only cross-module writes; never external calls inside      | `src/db/index.ts` (`Tx`, `inTransaction`), `order.service.ts`                                   | `transaction-discipline`; the `Tx` type is a compile-time check; callee use of `tx` is review         |
| D17 | Each project owns its UI (`src/ui`)                                                 | `src/ui/*`, `src/ui/tokens.css`, `modules/*/components`                                         | `ui-no-server`, `components-no-persistence`; the placement test itself is **documentation only**      |
| D18 | The policy file is the architecture description; diagrams generated                 | `scripts/arch/diagram.mjs`, `docs/architecture.md`                                              | `pnpm arch:diagram:check` (inside `pnpm arch`)                                                        |

## Brownfield adoption

1. Copy `architecture.json`, the schema, `scripts/`, `tests/architecture/`, `knip.json`,
   `.jscpd.json` and the CI jobs into the existing repo. Adjust `srcRoot`, `modules` and `tables`.
2. Generate the baselines from the current state. Every existing violation, including those of the
   non-negotiable rules, becomes one line in `quality/arch-baseline.json`. The same file turns the
   matching eslint policies into exact file-to-file allowances, so the editor stays quiet only for
   debt you approved.
3. From then on, additions fail; fixing a violation deletes its line; a line whose violation is
   gone fails as stale. A baseline can only shrink (`pnpm arch:baseline`, compared with the merge
   base of the target branch).
4. Moving a file that has baselined findings goes through `scripts/quality/baseline-rename.mjs`, which
   records the move in `quality/baseline-renames.json`. An unexplained rename counts as a new
   violation.
5. Never baselinable, even here: client code reaching server code or secrets
   (`client-runtime-closure`, `public-door-closure`, `server-only-in-server-files`, `ui-no-server`).
6. Migrate in this order: doors, rules files, data ownership, workflows. Move one vertical slice at
   a time.

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
- Versions are pinned in `package.json` (Node 22, TypeScript 6.0.3). TypeScript 7 was not tried.

## Versioning

The blueprint, the JSON Schema and the scripts share one version, recorded in
`template/CHANGELOG.md`. `architecture.json` carries `$schemaVersion`; the scripts refuse another
major version. To upgrade an app, copy the new `scripts/` and `tests/architecture/`, follow the
changelog and run `pnpm check`.
