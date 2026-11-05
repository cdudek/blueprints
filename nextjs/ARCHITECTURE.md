---
title: Next.js application architecture blueprint
status: approved
version: 1.0.0
audience: engineers and agents building or changing a Next.js App Router application
stack: Next.js App Router, TypeScript, Postgres (drizzle; Prisma works the same way), zod
template: ./template (runnable, carries every rule below as code)
---

# Next.js application architecture blueprint

## 1. Summary

Build every app as a **modular monolith**. Each business capability is a module with a small,
predictable inside: a service, a repository, pure rules, a schema and its business components.
Next.js (`app/`, Server Actions, route handlers, `proxy.ts`) is a thin outer layer: it validates
input, calls a service and returns a small result.

The separation is the one hexagonal and clean architecture aim for, without their vocabulary: no
ports for the database, no command classes, no DI container. Ordinary functions and direct imports.

One test decides whether it works: **a developer or agent can change one capability without
silently changing another capability's data, bypassing its rules, or hiding business logic in
routes to satisfy an import checker.**

A policy file and CI checks keep it that way. This document is the blueprint for greenfield and
brownfield apps alike; section 13 says what only brownfield needs. The `template/` folder is a
runnable project that follows it, and every rule below is code there, not prose. Where a rule can
only be reviewed, section 11 says so.

## 2. Why this shape

| Option                                                           | Our tradeoff                                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hexagonal, clean, onion                                          | Same separation, but the vocabulary (ports, adapters, use cases) and a port per table cost more than they buy for a team on one stack. We keep ports only for third-party services.                |
| Data access in Server Components                                 | Supported by Next.js and fast to write, but hard to audit for authorization and for data leaking to the client once an app grows. Next.js recommends it for prototypes.                            |
| Plain feature folders (Bulletproof React), Feature-Sliced Design | Good for frontend code; no rule for where auth, transactions and queries live.                                                                                                                     |
| Layered (n-tier)                                                 | Business rules end up depending on the database layer.                                                                                                                                             |
| **Modules with service, repository, rules**                      | Matches the server-only Data Access Layer Next.js recommends for new projects, plus Fowler's Service Layer and Repository. Familiar to anyone who used Rails, Nest, Spring or Laravel. **Chosen.** |

What the sources confirm:

- Next.js recommends a server-only Data Access Layer that performs authorization and returns
  minimal DTOs, with `"use server"` actions staying thin. Service plus repository is that layer.
- Every Server Action is a public POST endpoint. Auth and ownership checks run inside every call
  path, not only in the page or `proxy.ts`.
- One explicit entry point per module, enforced by tooling, is standard modular-monolith practice.
- Next.js is unopinionated about project organisation; module names and door files are our convention.

## 3. Folder structure

```text
src/
  proxy.ts                         redirects and headers only (middleware.ts before Next 16)
  app/                             Next.js only: routing, pages, actions, route handlers
    orders/
      page.tsx
      actions.ts                   "use server": safeParse, call the service, revalidate, return a DTO
    api/webhooks/payments/route.ts verifies the sender, sequences modules; documents the workflow
    api/cron/payments/route.ts     authenticates the scheduler, calls one job operation
  modules/
    orders/
      public.ts                    browser door: types, zod schemas, components. Not "use client" by itself
      server.ts                    server door: service operations. Starts with import "server-only"
      order.service.ts             operations: access policy, authorization, transaction boundary, side effects
      order.repository.ts          this module's queries; private
      order.rules.ts               pure rules: pricing, eligibility, allowed transitions
      order.rules.test.ts
      order.schema.ts              zod input schemas
      order.types.ts               types and typed errors
      order.tables.ts              the tables this module owns (drizzle) or the owner note (Prisma)
      order.jobs.ts                retries and sweeps this module owns (when needed)
      components/                  business components, built from src/ui
  clients/
    <service>/                     third-party port: base.ts, factory.ts, providers/ (real, fixture, noop)
  db/
    index.ts                       the database client, DbClient, Tx and inTransaction (the one gateway)
    schema.ts                      composition root: imports every module's table files, and only those
  shared/
    auth.ts                        getSession, requireUser, requireRole
    access.ts                      operation({ access }, fn): the declared access policy of an operation
    result.ts                      Result with typed errors
    env.ts                         the only reader of process.env
  ui/                              this project's own design system: atoms, generic patterns, tokens
drizzle/                           generated migrations and reviewed custom ones (cross-module constraints)
architecture.json                  the policy file (section 11)
```

**Start flat.** Add subfolders inside a module (for example `rules/` or `domain/`) only when it
passes about ten files. The table-definition check reads flat `*.tables.ts` files, so keep them
flat or extend the check with the folder.

## 4. The rulebook

1. **`app/` is Next.js only.** Pages load data through a module's `server.ts` and render. Actions
   and route handlers `safeParse` input with the module's schema from `public.ts`, call a service,
   revalidate or redirect, and return a small DTO. No database access and no business logic in
   `app/`.
2. **Each module has two doors with different jobs.** `server.ts` is for **service calls**: it
   starts with `import "server-only"` and re-exports operations by name. `public.ts` is for
   **browser-safe** exports: types, zod schemas and components. It is browser-_compatible_, not a
   `"use client"` boundary; a component in it may be a server component. Doors list exports by
   name: no `export *`, no aliases, no declarations, and never a repository or a table. Inside a
   module, use relative imports, never the module's own doors. A Server Action reaches a module's
   component through props (the page passes the action to the component), never by importing the
   action into the module.
3. **Every service operation declares one access policy, with `operation()`.** The policy is one of
   `user` (a signed-in caller; names the resource permission the function checks), `public` (anyone;
   declares input validation and abuse controls), `webhook` (called only by a route that verified
   the sender) or `job` (called only by a trusted scheduler entry point). A function's name grants
   nothing. `user` operations authenticate for you and answer a typed `unauthenticated` error, not a
   thrown one; the resource check (`findForUser`, an ownership comparison) stays in the function and
   a behaviour test proves it. Reads are operations too. `webhook` and `job` operations are system
   operations: only route handlers call them, never an action, page, component or user operation.
4. **Repositories issue the module's queries.** Services do not write SQL or ORM queries; they call
   the repository. Every repository method accepts an optional database client.
5. **Rules are pure.** `*.rules.ts` takes data and returns data or a `Result`. No database, network,
   Next.js or React, no environment, no clock, no randomness, no ambient global: the service passes
   time, random values and config in. Its runtime dependency closure is limited to other rules,
   types, schemas, `shared/result` and a short list of packages. Repository conditional updates use
   the same constants as the rules, so the check and the write cannot disagree.
6. **State is explicit and safe under concurrency and retries.** Status is a database enum, not a
   free string. Transitions are conditional updates on the expected current state, and the code
   checks a row actually changed: **a lost update is reloaded and recomputed, never reported as
   success.** A retry reuses a persisted identity (a checkout, a payment attempt) and resumes with
   the terms it persisted; idempotency keys back that up. External calls never run inside a database
   transaction: the transaction records what must happen, a retryable job does it.
7. **Results are deliberate.** Expected failures (validation, not found, conflict, not allowed, not
   signed in) come back as a `Result` whose error is a union of string codes, so the UI branches on
   the kind. Unexpected failures throw. Services return domain records; actions and pages map them to
   DTOs and never hand raw records to client components. Only `shared/env.ts` reads `process.env`.

## 5. Data ownership and transactions

- **Every table has exactly one owning module**, recorded in `architecture.json`. Its definition
  lives in the module (`<x>.tables.ts`). `src/db/schema.ts` is the persistence **composition root**:
  the only place allowed to import every module's table files (and only table files), so drizzle's
  relational queries work and the schema is complete. `drizzle.config.ts` reads the same files.
- **Only the owner writes** its tables, through its repository.
- **Other modules read through the owner's service.** A direct read (an admin report, a join for a
  list) is allowed only as a declared exception in `architecture.json`: one reader **file**, one
  **table**, with a reason and a declared edge. The check refuses any other table in that file, a
  namespace import, `insert`/`update`/`delete` of the table and raw SQL. An import check cannot tell
  a read from a write in general, so the exception is narrow and an owner query function is
  preferred. Raw SQL that writes another module's table without importing its definition is a
  review obligation.
- **Cross-module foreign keys are kept**, and live in a reviewed custom migration
  (`drizzle/…_payments-order-fk.sql`) that the owners of both tables review together. Removing a
  constraint to avoid an import edge is not allowed.
- **Transactions.** The calling service owns the boundary and opens it only through `inTransaction`
  (`src/db`), the single gateway. An operation that must run in its caller's transaction takes a
  `Tx` parameter (not an optional client), so it cannot be called without one and cannot open its
  own. Inside a transaction callback the checks refuse an external client call, `fetch`, a nested
  transaction and a module operation that does not receive the `tx`. A failed expected step inside
  the callback throws, which rolls the transaction back. What no tool proves: that a callee you pass
  `tx` to really uses it, that isolation level and retry assumptions are right, and indirect call
  paths. Those are review obligations.
- **Caller identity across modules.** A module that needs another module's resource takes a trusted
  contract, not raw ids: billing takes an `AuthorizedOrder` that orders builds only after loading the
  order for the signed-in user, re-checks the user, and the database refuses a payment for a missing
  order. Billing does not treat the first creator of a payment as proof of order ownership.
- Seed and demo-data scripts live outside `src/` and are a declared exemption, never production code.

## 6. UI

**This public template deliberately has no central design system. Each project owns its UI and UX.**
`src/ui` is that project's own design system: its atoms (Button, Input, Badge, Text), its generic
patterns and its tokens (CSS custom properties). A company that does keep a central design system
replaces the contents of `src/ui` with thin wrappers over it; the rules below do not change.

- **`src/ui` has no business nouns.** It never imports a module, the database, a client, `src/db`,
  auth, env, `src/app` or `server-only`. It is the one place a visual decision is changed.
- **Business components** live in `modules/<x>/components/`, are built only from `src/ui`, and know
  the module's types. A business component that other areas render is exported from the module's
  `public.ts` (browser-safe, may be a server component). Components never import a repository,
  tables or the database; data comes through props.
- **Page composition** lives in `app/`.
- **The placement test:** does the component know a business noun (order, invoice, customer)? No →
  `src/ui`. Yes → the module. A pattern two modules need and that has no noun moves up into `src/ui`.

## 7. Module dependencies and workflows

- **Declared edges apply to both doors.** `architecture.json` lists every allowed direction
  (orders → billing). Calling `billing/server.ts` and importing `billing/public.ts` are both
  dependencies and both need the edge. An edge that would create a cycle is refused.
- When two modules need each other, move the responsibility to its owner, or let the caller in
  `app/` sequence them (the payments webhook calls billing, then orders). Merging modules is the
  last option.
- A generic module (identity, notifications) stays generic: a feature registers its specifics at
  composition time; the generic module never imports the feature.
- **A process that spans modules is a named, tested function** with one owner: the service of the
  capability that owns the outcome, or a route or action for simple sequencing. Its header answers
  four questions, and a check refuses an action or route that sequences two modules without them:
  `retry-safe`, `duplicates`, `recovery`, `survives-restart`.
- **Durable work** (must survive a crash, retried by a job) uses a table drained by one cron route:
  the template's payment inbox and cancel/refund worker. Record the intent durably **before**
  acknowledging the work that must survive. No general event bus until a module must react without
  the publisher knowing who listens.

## 8. Third-party services

- Each service sits behind a port in `src/clients/<service>/`: a narrow interface named after the
  business operation, plain inputs and outputs, a closed set of results and errors. Vendor SDK types
  never cross the port. The port carries a correlation id we persisted, so an event finds its
  payment even if it beats our bookkeeping.
- Providers: the real one, a `fixture` (canned responses for tests and local dev) and a `noop`. The
  factory builds the real provider only in production with a key; the real provider takes `fetch` as
  a parameter and the global `fetch` is stubbed to throw in tests, so no test can reach a live API.
- A module service owns the calls to its vendor (orders never talks to the payment provider;
  billing does). A provider is imported only inside its client folder.

## 9. Runtime boundaries

- Server files (server doors, services, repositories, `src/db`, `shared/{auth,env,access}`, client
  indexes) start with `import "server-only"`.
- What a browser bundle can reach is decided by the **runtime dependency closure** of every
  `"use client"` file and every browser door, resolved through TypeScript (tsconfig paths included).
  The closure may not reach a service, repository, table file, `src/db`, a client, server-only
  shared code, a server door, a server-only package, a Node builtin, or a non-public environment
  variable. Erased `import type` edges are fine. A client file's unmarked helper is part of the
  client graph and is checked as such.
- `"use server"` files, as a real directive prologue, exist only in `app/` and export only actions.

## 10. Testing

| Layer             | What                                                  | How                                                                                          |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Rules             | every branch                                          | plain unit tests, no mocks                                                                   |
| Services          | permissions, main workflows, conflict paths           | a handful per operation against a real test database                                         |
| Repositories      | conditional updates, find-or-create under concurrency | integration tests against real Postgres (PGlite locally, a Postgres service in CI)           |
| Third parties     | the contract the app relies on                        | fixture provider; the real provider with an injected `fetch`                                 |
| Webhooks and jobs | signature failure, duplicates, out-of-order, retries  | integration tests with fixtures                                                              |
| Actions and pages | the happy path and one validation failure             | Playwright E2E against the production build                                                  |
| Architecture      | every rule, and that each rule can fail               | fixtures: violations flagged by the intended rule only, positive controls, specific messages |

The worked slice (`template/docs/worked-slice.md`) links each failure case to its test and names
what is **not implemented**: retry, changed checkout, cancel race, duplicate webhook, late payment
after cancel, lost conditional update, webhook before linkage, unmatched event, the cancel/refund
worker. A test fails if a link goes stale.

## 11. Enforcement

**`architecture.json` is the single source of truth:** doors with roles, modules, declared edges,
table owners, read exceptions (file + table), exemptions, clients, server-only packages and the
rules allowlist. The eslint config, the architecture tests and a Mermaid diagram are all built from
it. Its JSON Schema is versioned with the scripts (section 17).

| Tool                                            | Job                                                                                                                                 | Gate                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| eslint-plugin-boundaries (generated)            | instant editor feedback; resolved files; re-exports and dynamic imports; checks dependencies inside a module; rejects unknown files | hard fail                                        |
| ArchUnitTS (`archunit`, rules built at runtime) | folder-to-folder rules over top-level imports; cycles; content rules; metrics                                                       | hard fail                                        |
| Resolved graph (`tests/architecture/graph.ts`)  | re-exports, literal dynamic imports, tsconfig paths, runtime vs type edges: cycles, closures, purity                                | hard fail                                        |
| ArchUnitTS metrics and graph                    | coupling per module, dependency graph, HTML report as a CI artifact                                                                 | report only                                      |
| knip ratchet                                    | unused files, exports, dependencies; entries and test graph configured in `knip.json`                                               | fail on new findings and on stale baseline lines |
| jscpd ratchet                                   | duplication above 50 tokens and 5 lines, fingerprinted by files and content hash                                                    | fail on new clones; reviewed exceptions allowed  |
| baseline-shrinks                                | a baseline may only shrink, compared with the merge base of the target branch; fails closed in CI                                   | hard fail                                        |
| policy-changes                                  | lists policy, exclusion, suppression and baseline changes together in the PR output                                                 | information                                      |

**Duplication rule:** no new duplication above the threshold. Extract only when the two copies
change for the same reason; otherwise rename or restructure them so they stop matching, or record a
reviewed exception with a reason. A gate must not push people into wrong shared abstractions. A
clone is keyed by its two files plus a hash of the whitespace-normalised text, not by line numbers;
a tool upgrade that changes detection is applied in its own PR that regenerates the baseline.

**Baselines.** The identity of a finding is `rule|file|target#n`: the n-th occurrence of the same
rule, file and target, so a second violation of the same kind in the same file is new. Moving a
file with baselined findings uses `scripts/quality/baseline-rename.mjs` (it records the move in
`quality/baseline-renames.json`); an unexplained rename counts as an addition.

**Analyzer failures fail.** A crashed analyzer, an invalid report or a rule whose selection matches
no file is a failure, never a pass. Role selections (rules, services, repositories, tables, doors,
components, providers) are asserted non-empty in the real tree.

### Coverage matrix

Every guarantee is one of: **RD** resolved-dependency check, **SH** syntax heuristic, **BC** build
check, **BT** behaviour test, **RO** review obligation. Where a guarantee has more than one
mechanism, all are listed; where it ends in RO, that part is not enforced by a tool.

| Guarantee                                                                  | Mechanism     | Notes                                                                                                                |
| -------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| No import cycles                                                           | RD            | complete graph: imports, re-exports, literal dynamic imports, type imports. ArchUnitTS alone misses re-export cycles |
| `import()` is analysable                                                   | RD            | non-literal dynamic imports are refused                                                                              |
| Modules are entered only through doors                                     | RD            | ArchUnitTS, complete graph (re-export, dynamic) and eslint; alias, relative, indirect and mapped paths               |
| Declared edges hold, for both doors                                        | RD            |                                                                                                                      |
| Every file sits in a declared root; doors exist; declared modules exist    | RD            | `roots-classified`, `modules-declared`, eslint `no-unknown-files`                                                    |
| Doors expose only what their role allows                                   | RD + SH       | resolved export targets; no `export *`, aliases, declarations, repositories, tables                                  |
| A browser door or client component reaches no server code or secret        | RD + BC       | runtime closure; Next's `server-only` build error is an independent guard                                            |
| Rules are pure: imports and closure                                        | RD            | allowlisted closure                                                                                                  |
| Rules are pure: clock, randomness, env, network, globals                   | SH, partly RO | `Date`, `Math.random`, `process`, `fetch`, `crypto`, …; arbitrary JavaScript purity cannot be proved                 |
| `src/ui` and `src/shared` stay generic; components never touch persistence | RD            |                                                                                                                      |
| Nothing imports `src/app`; app never touches persistence                   | RD            |                                                                                                                      |
| Only the owner imports its table files                                     | RD            | plus `src/db` and declared read-exception files                                                                      |
| Tables are declared, owned by the folder's module, defined once            | SH            | literal `pgTable` in flat `*.tables.ts` only; aliased builders, subfolders and raw DDL are RO                        |
| Schema composition is complete                                             | RD            | `src/db/schema.ts` imports every table file                                                                          |
| A read exception is one file, one table, read-only                         | RD + SH       | named import, no write call, no raw SQL; a raw-SQL write elsewhere is RO                                             |
| Cross-module foreign keys exist                                            | BT + RO       | database test; the migration is reviewed by both owners                                                              |
| Providers are imported only inside their client folder                     | RD            |                                                                                                                      |
| No test reaches a live API                                                 | BT            | global `fetch` stubbed to throw                                                                                      |
| Every operation declares an access policy                                  | BT            | policy registry test over every server door export; a syntax check is diagnostic only                                |
| User operations refuse anonymous callers with a typed error                | BT            |                                                                                                                      |
| The resource permission inside a user operation is correct                 | BT + RO       | one behaviour test per operation (another user's resource); the code is reviewed                                     |
| System operations are called only from route handlers                      | RD + SH       | by imported name, namespace imports refused, user operations may not call them                                       |
| Webhook and cron routes verify the caller                                  | BT            | signature and secret tests                                                                                           |
| Actions are thin                                                           | RD + RO       | no persistence imports, `"use server"` only in app; "no business logic" is RO                                        |
| Transactions: gateway, no external call, no nesting, `tx` passed on        | SH + BC       | direct calls only; the `Tx` type makes a missing transaction a compile error                                         |
| A callee given `tx` really uses it; isolation and retry assumptions        | RO            |                                                                                                                      |
| State safety: conditional updates, lost updates, retries                   | BT            | the worked slice                                                                                                     |
| Webhooks: duplicates, out of order, late, before linkage, unmatched        | BT            | the worked slice                                                                                                     |
| A cross-module workflow documents its retry and recovery behaviour         | SH + RO       | header fields are checked; whether they are true is RO                                                               |
| Server files start with `import "server-only"`                             | SH + BC       |                                                                                                                      |
| No new unused code, no new duplication                                     | build check   | knip and jscpd ratchets                                                                                              |
| Baselines only shrink; policy changes are visible                          | build check   | merge-base comparison; governance output                                                                             |

**Adversarial acceptance cases** (each is a fixture or test, not only one violation per rule):
same-module imports (rules or a component importing their own repository), a repository re-exported
through a door, an alias-mapped path to a server file in a client file, a transitive client helper,
a cycle closed by a re-export, an impure helper behind a rules file, a lost conditional update, a
webhook before linkage, an unknown file re-exporting a repository, an action calling a system
operation. Fixtures assert the intended rule **only**, assert the specific message, and each has a
clean twin (an erased `import type`, a string that is not a directive prologue) that must pass.

## 12. Non-negotiables

1. No import cycles.
2. Modules are entered only through their two doors, along declared edges.
3. Rules files are pure and deterministic.
4. Every table has one owner; only the owner writes; cross-module reads only as declared exceptions.
5. External calls never run inside a database transaction.
6. Every service operation declares its access policy; actions are thin; system operations are
   reachable only from verified routes.
7. Browser code cannot reach server code or secrets.
8. Vendors only through their port; every port has a fixture provider; no test reaches a live API.
9. Cross-module processes have an owner and defined retry and recovery behaviour.
10. UI atoms live in `src/ui` (the project's own design system); business components live in their module.
11. One policy file; every rule has a deliberate-violation fixture.

Non-negotiable means **a new violation always fails**. It does not mean "never admitted to a
baseline": see section 13.

## 13. Greenfield and brownfield

- **Greenfield:** every rule is a hard failure from the first commit; the baselines are empty. Start
  from the module generator (`pnpm new:module`: doors, service, repository, rules with a test,
  tables, schema, a component and the policy entry). Build one complete slice first (capture, save,
  show to an authorised user), then add capabilities.
- **Brownfield:** add the policy and tools first. Existing violations of **any** rule, the
  non-negotiables included, may be frozen as approved migration debt in `quality/arch-baseline.json`
  (one line per occurrence). The same baseline feeds the architecture tests and, as exact
  file-to-file allow policies, eslint. Additions always fail; a fixed violation deletes its line; a
  line whose violation is gone fails as stale. Then move in this order: doors, rules files, data
  ownership, workflows.
- **Never admitted to a baseline**, even in a brownfield app: server code or secrets in a browser
  bundle (`client-runtime-closure`, `public-door-closure`, `server-only-in-server-files`,
  `ui-no-server`). That is a leak, not migration debt.
- A baseline change is reviewed by the owners of the policy (CODEOWNERS), is compared with a trusted
  base revision, and shows up in the governance output.

## 14. Add later, not now

| Add                                            | When                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Subfolders inside a module                     | it passes about ten files                                                   |
| Separate read functions (`<x>.queries.ts`)     | pages need joined or aggregated reads that do not fit the service           |
| Repository interfaces                          | a second backend appears or a test needs to swap it                         |
| Explicit caller parameter on shared operations | an action and a job need the same operation                                 |
| Events between modules                         | a module must react without the publisher knowing who listens               |
| Outbox table                                   | an event must survive a crash between commit and publish                    |
| Numeric coupling gates                         | months of report data show a threshold that would have caught real problems |
| Packages in a monorepo                         | a second app needs the same modules                                         |

## 15. Deliberately skipped

- Ports for the database, adapters, commands, use-case classes.
- DI containers (tsyringe, inversify).
- CQRS and event sourcing.
- Barrels that re-export whole folders.
- Paid quality-score services; the tools above are free.

## 16. Decision log

| #   | Decision                                                                                                                           | Rejected                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D1  | Modular monolith with service, repository, rules per module                                                                        | hexagonal or clean with full vocabulary; layered; Feature-Sliced Design       |
| D2  | No database port; concrete repositories, private to the module                                                                     | a repository interface per table                                              |
| D3  | eslint-plugin-boundaries (editor) + ArchUnitTS and a resolved graph (CI), all built from `architecture.json`                       | dependency-cruiser (overlaps); ts-arch; eslint alone                          |
| D4  | knip and jscpd as ratchets on new findings, with reviewed exceptions for intentional duplication                                   | paid score services; an unbounded duplication gate                            |
| D5  | One policy file generates the rules                                                                                                | two hand-kept lists                                                           |
| D6  | Pure rules in `<x>.rules.ts`; a folder only when a module grows                                                                    | a `domain/` folder in every module                                            |
| D7  | One owning module per table; only the owner writes; reads through the owner or file-and-table exceptions; foreign keys kept        | any module may query any table; dropping a foreign key to avoid an import     |
| D8  | Coupling metrics report only                                                                                                       | a coupling ratchet                                                            |
| D9  | Two doors with roles: `server.ts` for service calls, `public.ts` for browser-safe types, schemas and components                    | one `index.ts`; three doors                                                   |
| D10 | Flat modules; purity and UI-never-touches-persistence enforced                                                                     | ring folders everywhere                                                       |
| D11 | Declared, acyclic module edges, applying to both doors                                                                             | a fixed hub list                                                              |
| D12 | Brownfield baselines per occurrence for any rule except leaks into the browser; a baseline may only shrink                         | count-based baselines; fix everything first; non-baselinable rules            |
| D13 | Pilot in one real app, then reuse through the template (section 17)                                                                | org-wide at once                                                              |
| D14 | Named workflows with a four-question header; durable intent before acknowledging; jobs and inbox tables where durability is needed | function injection everywhere; an outbox for every effect                     |
| D15 | Thin `"use server"` actions in `app/`; an explicit access policy per operation inside services                                     | checks in pages or `proxy.ts`; trust by function name; actions inside modules |
| D16 | A service passes its transaction (a `Tx`) to another module's service for DB-only writes; never external calls inside              | transactions never cross modules                                              |
| D17 | Each project owns its UI: `src/ui` is the project's own design system; business components live in modules                         | a central design system dependency in the public template                     |
| D18 | `architecture.json` is the architecture description; diagrams are generated and checked for staleness                              | a formal ADL; hand-drawn diagrams as the source                               |

## 17. Rollout and versioning

1. **Pilot** in one real application, adopting the template and the policy file.
2. **The pilot is done when:** four weeks pass without a new violation, baselines are down at least
   30 %, every rule has a working deliberate-violation fixture, and the team calls the friction
   acceptable.
3. **Then reuse:** other apps copy the template at a known release and write their own
   `architecture.json`; improvements flow back into this blueprint.
4. **Versioning.** The blueprint, `architecture.schema.json` and the scripts share one version
   (`template/CHANGELOG.md`). `architecture.json` carries `$schemaVersion`; the scripts refuse a
   different major version. An app upgrades by copying the new scripts and following the changelog.
5. Python apps can get the same blueprint with import-linter (rules) and radon (complexity).

## 18. Sources

- Next.js, How to think about data security: https://nextjs.org/docs/app/guides/data-security
- Next.js, Preventing environment poisoning: https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning
- Next.js, Project structure: https://nextjs.org/docs/app/getting-started/project-structure
- Next.js, proxy.ts: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- React, directives (transitive dependencies of `"use client"` are client code): https://react.dev/reference/rsc/use-client
- Martin Fowler, Service Layer: https://martinfowler.com/eaaCatalog/serviceLayer.html
- Martin Fowler, Repository: https://martinfowler.com/eaaCatalog/repository.html
- Martin Fowler, The Practical Test Pyramid: https://martinfowler.com/articles/practical-test-pyramid.html
- Alistair Cockburn, Hexagonal architecture: https://alistair.cockburn.us/hexagonal-architecture
- Spring Modulith, module verification: https://docs.spring.io/spring-modulith/reference/verification.html
- ArchUnitTS: https://github.com/LukasNiessen/ArchUnitTS
- eslint-plugin-boundaries: https://github.com/javierbrea/eslint-plugin-boundaries
- knip: https://knip.dev
- jscpd: https://github.com/kucherenko/jscpd
- Drizzle ORM, relational queries and migrations: https://orm.drizzle.team/docs
