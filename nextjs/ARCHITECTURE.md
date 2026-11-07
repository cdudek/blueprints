---
title: Next.js application architecture blueprint
status: approved
version: 1.1.0
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
brownfield apps alike; section 15 says what only brownfield needs. The `template/` folder is a
runnable project that follows it, and every rule below is code there, not prose. Where a rule can
only be reviewed, section 13 says so. Section 2 gives the principle behind each rule, and section 12
the production defaults.

## 2. Principles

The rules in this document are not a style. Each one carries out a principle that has a source
and a reason. When a rule seems to get in the way, check it against its principle: either the
principle does not apply to the case (record an exemption with the reason), or the code is the
thing that has to change.

**Cut along decisions that are likely to change.** A module hides one decision (how orders are
priced, how a payment is taken) behind a small interface, so that changing the decision changes
one module. Parnas showed in 1972 that this beats cutting along the steps of a flowchart. Carried
out by: modules in `src/modules/<capability>`, the two doors, `module-doors`, `declared-edges`.

**The top level shows the domain.** Opening `src/modules` should tell a reader what the
application does (orders, billing, accounts), not which framework it uses. Framework folders
(`app/`, `db/`) sit beside the modules, not around them. Source: Robert C. Martin, "Screaming
Architecture". Carried out by: the folder layout in section 4, `roots-classified`.

**Dependencies point one way and never cycle.** A cycle means two modules can only change
together, so they are one module with two names. Dependencies are declared, point from the
caller to the callee, and form a graph without cycles at the module level and at the file level.
Source: the acyclic dependencies principle (Robert C. Martin). Carried out by: `edges` in
`architecture.json`, `declared-edges`, `declared-edges-acyclic`, `no-cycles`,
`no-cycles-complete`.

**A module has a small public surface and keeps the rest private.** Everything another module may
use is listed by name in a door; repositories, tables and helpers stay private, so the inside can
change without telling anyone. Source: Parnas (information hiding); Spring Modulith's module
verification. Carried out by: `server.ts` and `public.ts`, `door-exports`, `module-doors`,
`module-doors-complete`.

**Each module owns its data.** One module owns each table and is the only one that writes it.
Other modules ask the owner, or read through a declared exception for one file and one table.
Shared tables are shared decisions, and shared decisions are what modules exist to avoid.
Carried out by: `tables`, `tables-owner-only`, `read-exceptions-exact`,
`table-definitions-declared`.

**Boundaries need a tool, adopted with a baseline that only shrinks.** A boundary that only lives
in a document erodes with the first deadline. Every rule is a check that fails the build; an
existing codebase freezes today's violations in a baseline and may only remove lines from it.
Source: ArchUnit-style architecture tests; ratcheting as practised with linters. Carried out by:
`tests/architecture/`, the knip and jscpd ratchets, `arch:baseline`.

**Parse at the edge, then trust the types.** Untrusted input (form data, a webhook body, an
environment variable) is parsed once, where it enters, into a typed value; code behind the edge
does not check it again. Source: Alexis King, "Parse, don't validate". Carried out by: zod
schemas in `<x>.schema.ts`, `safeParse` in actions, `shared/env.ts` as the only reader of
`process.env`.

**Pure core, side effects at the shell.** Decisions (prices, allowed transitions, eligibility)
are pure functions of their inputs; the service around them reads the clock, the database and
the network and passes the results in. The core is tested without mocks. Source: Gary
Bernhardt, "Functional core, imperative shell". Carried out by: `<x>.rules.ts`,
`rules-pure-imports`, `rules-pure-closure`, `rules-pure-content`.

**Abstract only what really varies.** A port exists for a third-party service, because the vendor,
the fixture and the no-op provider really differ. There is no port for the database, no
repository interface and no use-case class, because nothing varies there yet. Duplication is
cheaper than the wrong abstraction. Source: Sandi Metz, "The Wrong Abstraction". Carried out by:
`src/clients/<service>`, section 16 (add later), the duplication rule in section 13.

**Don't distribute early.** One deployable with strong module boundaries keeps refactoring
cheap; a service boundary is a network call, a deploy and a contract to version. A second
runtime (a worker process, a Python service) is added for a runtime reason, not for structure.
Source: Martin Fowler, "MonolithFirst". Carried out by: one Next.js app, `src/worker.ts` in the
same codebase, `services/` only for another runtime.

**Next.js specifics.** The framework adds five rules of its own:

- **A server-only data layer.** Data access and authorization live in server-only modules that
  return small DTOs, never in components. Source: Next.js, "How to think about data security".
  Carried out by: services and repositories, `server-only-in-server-files`.
- **Actions are public endpoints.** Every Server Action is a POST endpoint anyone can call, so
  each one parses its input and the operation it calls checks the session. Carried out by:
  `operation()` access policies, `system-operations-from-routes-only`.
- **No auth in layouts.** A layout does not re-render on navigation, so a check there does not
  protect the pages under it. Checks run in the operation every page and action calls. Source:
  Next.js, "Authentication". Carried out by: user operations, the access registry test.
- **No barrel files.** A folder-wide `index.ts` that re-exports everything defeats tree shaking
  and hides what crosses a boundary. Doors list exports by name. Source: Vercel, "How we
  optimized package imports in Next.js". Carried out by: `door-exports` (no `export *`).
- **One encryption key across instances.** Server Action ids and closed-over values are
  encrypted with a per-build key; several instances or a promoted build need the same
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and a pinned `deploymentId`. Source: Next.js,
  "Self-hosting". Carried out by: section 12.

### Where the sources disagree

- **Layers or slices.** Layered architecture groups code by technical role (all controllers,
  all repositories); vertical slices group it by feature. The blueprint slices first (a module
  per capability) and layers inside the slice (service, repository, rules), because the slice is
  the unit of change and the layers keep the slice readable.
- **Rich model or transaction script.** Domain-driven design puts behaviour on entities; the
  transaction script puts it in a procedure per operation. The blueprint uses transaction
  scripts (service operations) over plain records, with the decisions pulled out into pure
  rules. It reads like the Rails, Nest or Laravel code most teams know, and the pure rules give
  most of what a rich model gives for testing.
- **Events or direct calls.** Events decouple the publisher from its listeners; direct calls
  keep the flow visible and the failure local. The blueprint calls directly along declared
  edges and sequences two modules in a named workflow. An event comes in only when a module must
  react without the publisher knowing who listens (section 16).

## 3. Why this shape

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

## 4. Repository layout

The repository root, one job per folder:

```text
.github/            CI and deploy workflows
docs/               all prose; docs/architecture.md carries the generated diagram
drizzle/            generated migrations and reviewed custom ones (cross-module constraints)
infra/              optional: infrastructure as code when it lives with the app (its README says when not)
messages/           one JSON file per language (en.json is the default), typed keys
public/             files that need a stable URL (favicon, robots.txt); images are imported beside their component
quality/            baselines, reviewed renames, reviewed duplication exceptions
scripts/            ops scripts; scripts/arch/ and scripts/quality/ hold the checks
services/<name>/    another runtime, one folder each, with its own Dockerfile and contract
src/                the Next.js app
tests/              architecture/, e2e/, integration/, tooling/, fixtures/, helpers/
Dockerfile          three targets: web (standalone), worker, migrate
architecture.json   the policy (section 13)
```

Inside `src/`:

```text
src/
  proxy.ts                         redirects and headers only (middleware.ts before Next 16); imports no module
  instrumentation.ts               OpenTelemetry and onRequestError; imports no module
  worker.ts                        the worker process: a Postgres queue that calls job operations
  i18n/                            locale routing, request config and navigation (next-intl); no module
  app/                             Next.js only: routing, pages, actions, route handlers
    _shell/
      providers.tsx                "use client": the one place providers are composed
      nav.ts                       routes and their message keys
    _workflows/
      payment-event.ts             a named cross-module workflow with the four-question header
    [locale]/
      layout.tsx                   root layout: html, providers, messages
      orders/
        page.tsx
        actions.ts                 "use server": safeParse, read the session, call one operation or workflow
        _components/               composition: ui/ and browser doors only, data and actions through props
    api/webhooks/payments/route.ts verifies the sender, calls one workflow
    api/cron/payments/route.ts     authenticates the scheduler, calls one job operation
    api/health/route.ts            liveness for the platform
  modules/
    orders/
      public.ts                    browser door: types, zod schemas, components. Not "use client" by itself
      server.ts                    server door: service operations. Starts with import "server-only"
      order.service.ts             operations: access policy, authorization, transaction boundary, side effects
      order.repository.ts          this module's queries; private
      order.rules.ts               pure rules: pricing, eligibility, allowed transitions
      order.rules.test.ts          unit tests sit beside the code they test
      order.schema.ts              zod input schemas
      order.types.ts               types and typed errors
      order.tables.ts              the tables this module owns (drizzle) or the owner note (Prisma)
      order.jobs.ts                retries and sweeps this module owns (when needed)
      components/                  business components, built from src/ui
    accounts/                      the session: reads the cookie or calls the auth library
  clients/
    <service>/                     third-party port: base.ts, factory.ts, providers/ (real, fixture, noop)
  db/
    index.ts                       the database client, DbClient, Tx and inTransaction (the one gateway)
    schema.ts                      composition root: imports every module's table files, and only those
  shared/
    auth.ts                        the session type, requireUser(session), requireRole(session, role)
    access.ts                      operation({ access }, fn): the declared access policy of an operation
    result.ts                      Result with typed errors
    env.ts                         the only reader of process.env
  ui/                              this project's own design system, a leaf (section 7)
    Button.tsx Badge.tsx ...       public by file path (@/ui/Button); static ones carry no directive
    icons/                         Icon, glyphs, index.ts (the icon door)
    hooks/                         generic browser hooks, no business nouns
    lib/                           cn() and other pure helpers
    styles/                        theme.css (tokens), base.css, index.css (imported once by the root layout)
    *.stories.tsx                  beside the component they show
```

**Start flat.** Add subfolders inside a module (for example `rules/` or `domain/`) only when it
passes about ten files. The table-definition check reads flat `*.tables.ts` files, so keep them
flat or extend the check with the folder.

**Tests.** Unit and service tests sit beside the code (`order.rules.test.ts` next to
`order.rules.ts`), so a module moves with its tests. `tests/` holds what belongs to no single
file: `architecture/` (the rules), `e2e/` (Playwright), `integration/` (several modules or a
process entry point together), `tooling/` (the scripts), `fixtures/` (deliberate-violation
projects) and `helpers/`.

**Every path is configurable.** The folders above are defaults. An app whose folders differ
(an existing codebase with `src/features` instead of `src/modules`) sets them in the optional
`layout` block of `architecture.json`; the checks, the eslint config and the generators read the
same block. A policy file without the block gets exactly these paths.

## 5. The rulebook

1. **`app/` is Next.js only.** Pages load data through a module's `server.ts` and render. Actions
   and route handlers `safeParse` input with the module's schema from `public.ts`, call **one**
   operation or **one** workflow from `app/_workflows/`, revalidate or redirect, and return a small
   DTO. No database access and no business logic in `app/`.
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
   a behaviour test proves it. A `user` operation takes the caller's session as its first argument;
   the action or page reads it through the `accounts` module and passes it in, so no global session
   state exists. Reads are operations too. `webhook` and `job` operations are system operations:
   only route handlers, the worker (`src/worker.ts`) and the workflows they call may call them,
   never an action, page, component or user operation.
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

## 6. Data ownership and transactions

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
- **Transactions.** Exactly one place owns commit and rollback for each atomic use case: the
  service operation that opens it, only through `inTransaction` (`src/db`), the single gateway.
  Repositories never commit, roll back or open a transaction: they run on the client or `Tx` they
  are given. A workflow never opens one either; it sequences service operations, each its own
  atomic step (section 8). An operation that must run in its caller's transaction takes a
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

## 7. UI

**This public template deliberately has no central design system. Each project owns its UI and UX.**
`src/ui` is that project's own design system: its primitives (Button, Input, Badge, Text), its
generic patterns, its icons, its hooks and its tokens. A company that does keep a central design
system replaces the contents of `src/ui` with thin wrappers over it; the rules below do not change.

### Where a component goes

| Layer                   | Home                                                 | Rule of thumb                                                     |
| ----------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Tokens                  | `ui/styles/theme.css`                                | semantic names (`--color-accent`), themes override them           |
| Primitives and patterns | `ui/<Name>.tsx`                                      | no business noun, no copy; text arrives through props or children |
| Business components     | `modules/<x>/components/`                            | knows the module's types; data and actions arrive as props        |
| Chrome shared by pages  | `app/_shell/` (`providers.tsx`, `nav.ts`, the frame) | composition: `src/ui`, browser doors, props                       |
| Parts of one page       | `app/<route>/_components/`                           | composition: `src/ui`, browser doors, props                       |
| Layouts and pages       | `layout.tsx`, `page.tsx`                             | load data through server doors, read the session, pass props down |

**The placement test:** does the component know a business noun (order, invoice, customer)? No →
`src/ui`. Yes → the module. A pattern two modules need and that has no noun moves up into `src/ui`.

**Why not the popular layer-first tree.** Top-level `hooks/`, `contexts/`, `stores/`, `utils/`,
`lib/`, `types/`, `config/`, `providers/` and `components/common` group code by what it is, not by
what it is for, so every feature is spread across all of them and every folder becomes a junk
drawer. `roots-classified` refuses them and says where each belongs: a generic hook goes to
`ui/hooks`, a domain hook beside its component; a context lives with its provider; providers are
composed once in `app/_shell/providers.tsx`; navigation is `app/_shell/nav.ts`; types live in the
owning module's `<x>.types.ts`; a constant lives in the module that owns the concept.

### The rules

- **`src/ui` is a leaf** (`ui-leaf`). It imports only `src/ui` and the packages listed in
  `uiMayImport` (React, `next/link`, `next/image`, the styling helpers and the headless library):
  never a module, `src/shared`, a client, `src/db` or `src/app`. That keeps it portable: it can
  move to a workspace package unchanged when a second app needs it.
- **No barrel.** A component's public path is its file: `import { Button } from "@/ui/Button"`. A
  `"use client"` barrel would make every re-export client code, and a mixed barrel hides which file
  is a client boundary. The root layout imports `@/ui/styles/index.css` once.
- **Client boundaries are per file.** A static primitive (Badge, Text, a styled Button) carries no
  directive and stays a server component. An interactive one carries `"use client"` on its own
  file. Interactive primitives take `children` as slots, so the content inside stays
  server-rendered. A door never carries `"use client"` (`doors-no-client-directive`).
- **One icon door** (`icons-one-door`). Icons live in `ui/icons`; an icon package listed in
  `iconPackages` is imported only there, and callers import `@/ui/icons`. Swapping the package is
  one folder. An icon without a label is decoration (`aria-hidden`).
- **Providers are composed once** (`providers-composed-once`), in `app/_shell/providers.tsx`
  (a client file), rendered by root layouts only, wrapping `children`. A provider component is
  defined in `src/ui` (generic) or in a module's components (domain).
- **Global CSS has two owners** (`global-css-owners`): `src/ui` and the root layout. Everything
  else styles through `src/ui` primitives, utility classes, or a `.module.css` file.
- **Banned packages** (`banned-packages`). `bannedPackages` names packages with the reason they are
  not used. The template bans axios (Next.js extends `fetch`; external HTTP goes through a port)
  and the Redux family (server state lives in Server Components and actions; client state in
  `useState`, `useReducer` or the URL; a client cache, if ever needed, stays inside one module).
- **Stories are leaves** (`stories-leaf`): nothing imports a `*.stories.tsx` file.
- **Components never import a repository, tables or the database**; data comes through props.

### Styling

The template uses **Tailwind CSS v4**:

- Tokens are plain, semantic CSS variables in `ui/styles/theme.css` (`--accent`, `--surface`),
  overridden for the dark theme under `prefers-color-scheme` and `[data-theme]`. `@theme inline`
  maps them to utilities (`bg-accent`), so switching a theme changes variables, not classes.
- `@import "tailwindcss" source(...)` limits class scanning to `src/`, so prose in `docs/` or a
  change folder never generates CSS.
- Variants are closed unions mapped with `cva`; `cn()` (clsx plus tailwind-merge) merges a caller's
  `className`. Both are pure functions, so server components use them too.
- `components.json` points the shadcn CLI at `src/ui` (`ui`, `lib`, `hooks` aliases), so copied
  components land in the leaf folder and fall under the same rules. Radix is the headless base for
  interactive primitives: never hand-roll focus trapping, menus, dialogs or popovers.

**Without Tailwind.** Plain CSS with the same semantic variables works just as well: keep
`theme.css` and `base.css`, style primitives with classes and `data-*` attributes in a stylesheet
under `ui/styles`, and drop `cva` and `cn`. A published UI package is easier to ship that way,
because the consumer's Tailwind does not have to scan it.

### Component API

- Spread native props (`ComponentProps<"button">`), merge `className` with `cn()`, take `ref` as a
  prop (React 19).
- Variants are closed string unions; no boolean-prop pile-ups (`isPrimary`, `isLarge`). Prefer
  composition (children, slots) over modes. `asChild` only for real polymorphism (a link styled as
  a button).
- Controlled and uncontrolled pairs: `value`, `defaultValue`, `onValueChange`.
- A server component passes an icon or slot as an element (`icon={<IconCheck />}`), never as a
  component reference, to a client component: props that cross the boundary must serialise.
- One primary export per file, PascalCase; `X.stories.tsx` and `X.test.tsx` beside it.

### Copy and languages

**Every app is translatable from the first commit, in English by default.** next-intl with the
App Router: locale routing in `proxy.ts`, pages under `app/[locale]/`, messages in
`messages/en.json`, typed message keys (a missing key is a type error). No user-visible string
is written in a page, a component or a primitive: pages and composition read messages with
next-intl, business components receive copy through props or read their own namespace, and
`src/ui` takes text only through props. A check (`copy-from-messages`) flags text in JSX and in
user-visible attributes (`alt`, `title`, `placeholder`, `aria-label`) in `app/`, `src/ui` and
module components. Adding a language is a messages file and a locale in the routing config.

### Accessibility and visual checks

- Native element first (`button`, `a`, `dialog`, `details`), a headless library for the rest; no
  `div` with `onClick`. `role="menu"` only for real menus; a popover with mixed content is a dialog.
- WCAG 2.2 AA: a visible focus ring token, targets of at least 24 px, `prefers-reduced-motion` in
  `base.css`, text contrast checked in every theme.
- **axe on real pages:** an E2E smoke test runs `@axe-core/playwright` over every page and fails
  on any violation.
- **Storybook** (`@storybook/nextjs-vite`) with the a11y addon set to fail: stories sit beside the
  `src/ui` components they show. Story props-only components; Server Components in Storybook are
  experimental and Server Actions do not run there.
- Automated checks find only part of the issues; keyboard-only use of each new flow is a review
  obligation.

## 8. Module dependencies and workflows

- **Declared edges apply to both doors.** `architecture.json` lists every allowed direction
  (orders → billing). Calling `billing/server.ts` and importing `billing/public.ts` are both
  dependencies and both need the edge. An edge that closes a cycle is a finding of its own
  (`declared-edges-acyclic`), so a brownfield app can baseline today's cyclic edges one by one.
- When two modules need each other, move the responsibility to its owner, or let the caller in
  `app/` sequence them (the payments webhook calls billing, then orders). Merging modules is the
  last option.
- A generic module (identity, notifications) stays generic: a feature registers its specifics at
  composition time; the generic module never imports the feature.
- **A process that spans modules is a named, tested workflow** with one owner: the service of the
  capability that owns the outcome, or a function in `app/_workflows/<name>.ts` when the process
  sequences modules that must not know each other. An action or route calls one workflow. The
  workflow's header block (the comment at the top of the file, not words anywhere in it) names it
  with `@workflow <name>` and answers four questions: `retry-safe`, `duplicates`, `recovery`,
  `survives-restart`. The check reads every file in `app/_workflows/`, and every action or route
  that still sequences two modules itself, and refuses two workflows with the same answers: a
  copied header is a header nobody thought about.
- **A process with more than one transaction names its intermediate states.** Each step commits
  on its own, so a crash can stop the process between two commits. The workflow says which
  persisted states it can stop in (a payment `cancel_pending`, an inbox row not yet processed) and,
  for each, whether it **resumes** (a job picks the state up and finishes forward) or
  **compensates** (a later step undoes an earlier one, such as a refund for a captured payment).
  The `recovery` answer of the header names them; a state with neither is a bug.
- **Durable work** (must survive a crash, retried by a job) is recorded in a table and drained by a
  job operation. The worker (`src/worker.ts`, a Postgres queue in its own process) runs the job on a
  schedule; where no worker process exists, a cron route does. The template's payment inbox and
  cancel/refund work show both. A job runs at least once, so every external call it makes carries
  an idempotency key derived from a persisted identity, never from the run: the cancel/refund job
  sends `<attempt id>:cancel` and `<attempt id>:refund`, so a retry, a second worker or a run that
  happened twice cannot cancel or refund twice. A scheduled job also has a stable job key, so the
  queue holds one pending copy. Record the intent durably **before** acknowledging the work that
  must survive. No general event bus until a module must react without the publisher knowing who
  listens.

## 9. Third-party services

- Each service sits behind a port in `src/clients/<service>/`: a narrow interface named after the
  business operation, plain inputs and outputs, a closed set of results and errors. Vendor SDK types
  never cross the port. The port carries a correlation id we persisted, so an event finds its
  payment even if it beats our bookkeeping.
- Providers: the real one, a `fixture` (canned responses for tests and local dev) and a `noop`. The
  factory builds the real provider only in production with a key; the real provider takes `fetch` as
  a parameter and the global `fetch` is stubbed to throw in tests, so no test can reach a live API.
  Production refuses `fixture` and `noop` (one accepts a public signature, the other everything)
  unless the E2E run sets `PAYMENTS_STUB=e2e`; a configuration-matrix test pins every combination.
- A module service owns the calls to its vendor (orders never talks to the payment provider;
  billing does). A provider is imported only inside its client folder.

## 10. Runtime boundaries

- Server files (server doors, services, repositories, `src/db`, `shared/{auth,env,access}`, client
  indexes) start with `import "server-only"` as their **first statement**, so nothing above it
  runs in a browser bundle before the marker fails the build.
- **Root files have narrow jobs.** `proxy.ts` (headers and redirects) and `instrumentation.ts`
  (tracing, error logging) import no module: they run on every request or at start, before any
  session exists. `worker.ts` is the worker process's entry point and calls job operations through
  server doors.
- **`src/shared` stays generic and does no I/O.** It never imports a module, a client, `src/db` or
  `src/app`, and no server-only package but `server-only` itself (no `next/headers`, no database
  driver). `shared/auth.ts` holds only the session type, `requireUser(session)` and
  `requireRole(session, role)`; reading the session (a cookie, an auth library that persists to the
  database) lives in a module, `accounts` in the template.
- What a browser bundle can reach is decided by the **runtime dependency closure** of every
  `"use client"` file and every browser door, resolved through TypeScript (tsconfig paths included).
  The closure may not reach a service, repository, table file, `src/db`, a client, server-only
  shared code, a server door, a server-only package, a Node builtin, or a non-public environment
  variable. Erased `import type` edges are fine. A client file's unmarked helper is part of the
  client graph and is checked as such. A `"use server"` file is reached but not entered: a client
  that imports an action gets a reference to it, and the action file's own imports stay on the
  server.
- `"use server"` files, as a real directive prologue, exist only in `app/` and export only actions.

## 11. Testing

| Layer             | What                                                  | How                                                                                          |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Rules             | every branch                                          | plain unit tests, no mocks                                                                   |
| Services          | permissions, main workflows, conflict paths           | a handful per operation against a real test database                                         |
| Repositories      | conditional updates, find-or-create under concurrency | integration tests against real Postgres (PGlite locally, a Postgres service in CI)           |
| Concurrency       | lost updates, duplicate jobs, two workers on one row  | real commits on separate connections, against Postgres (`TEST_DATABASE_URL`); never PGlite   |
| Third parties     | the contract the app relies on                        | fixture provider; the real provider with an injected `fetch`                                 |
| Webhooks and jobs | signature failure, duplicates, out-of-order, retries  | integration tests with fixtures                                                              |
| Actions and pages | the happy path and one validation failure             | Playwright E2E against the production build                                                  |
| Architecture      | every rule, and that each rule can fail               | fixtures: violations flagged by the intended rule only, positive controls, specific messages |
| UI                | accessibility of real pages; primitives in isolation  | `@axe-core/playwright` over every page; Storybook stories with the a11y addon                |

A concurrency or worker test that runs inside one rolled-back transaction, or on a single
connection, proves nothing about concurrency: each side must commit for real on its own
connection, the way two requests or two worker processes do. PGlite has one connection, so these
tests run only where `TEST_DATABASE_URL` points at a Postgres server (CI always has one).

Unit tests sit beside the code they test (`*.test.ts`); `tests/` holds the architecture suite,
E2E, integration tests that span modules or a process entry point (the worker), tooling tests and
fixtures (section 4).

The worked slice (`template/docs/worked-slice.md`) links each failure case to its test and names
what is **not implemented**: retry, changed checkout, cancel race, duplicate webhook, late payment
after cancel, lost conditional update, webhook before linkage, unmatched event, the cancel/refund
worker. A test fails if a link goes stale.

## 12. Running it

Production defaults. None of them is checked by the architecture suite; the template's
`Dockerfile`, `next.config.ts`, `instrumentation.ts`, CI and `.env.example` carry them out.

- **Build once and promote.** One image per commit, built once, promoted from staging to
  production unchanged. Configuration comes from the environment at start, never from a rebuild.
- **One encryption key across instances.** Set the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (a
  base64 AES key) on every instance and every promoted build, and pin `deploymentId` in
  `next.config.ts`, so a Server Action posted to one instance or across a deploy still decrypts.
- **Pass public values at runtime.** A `NEXT_PUBLIC_` variable is inlined at build time, which
  breaks build-once. Read public configuration on the server and pass it down as props, or render
  it into the page; keep `NEXT_PUBLIC_` for values that really are the same in every
  environment.
- **Migrations are a job before the traffic shift.** The `migrate` image target runs
  `scripts/db-migrate.mjs` once, before the new web revision takes traffic. A migration never
  breaks the revision that is still serving, so a schema change runs in this order:
  1. **Expand:** add the new column or table; nothing reads it yet, the old code ignores it.
  2. **Run old and new in parallel:** deploy code that writes both shapes and reads the old one;
     backfill. Old and new revisions, web and worker, now run against the same schema.
  3. **Switch:** move traffic to code that reads the new shape.
  4. **Stop the old:** retire the old web revision and the old worker, so nothing writes only the
     old shape.
  5. **Rollback window:** keep the old column until a rollback to the previous release can no
     longer happen.
  6. **Contract:** drop the old column in a later release, through the same migrate job.
- **Background work runs in a worker process.** `src/worker.ts` runs a Postgres queue
  (graphile-worker: `LISTEN/NOTIFY`, cron, job keys, no extra infrastructure) in its own process
  and calls job operations. Never run the queue inside the web process on a platform that bills
  or scales per request: the platform stops the CPU between requests. Where no worker process
  exists, a cron route handler (`api/cron/...`) is the scheduler entry point instead.
- **Health and readiness.** `/api/health` answers 200 when the process serves (the template ships
  it); a readiness route checks the database through a module operation and answers 503 until it
  can (add it with the first deploy). Readiness checks that the schema is **compatible** with this
  revision (the migrations it needs are applied), never that it is at the exact latest migration:
  during steps 2 to 5 above, an older revision runs against a newer schema and must stay ready.
  The deploy pipeline, not readiness, checks that the migrate job reached the expected state. The
  platform routes traffic on readiness and restarts on health.
- **Logs are JSON lines with a trace field.** One object per line, with `level`, `message` and
  the trace id from `traceparent`, so a request can be followed across the web process, the
  worker and a service. `instrumentation.ts` starts OpenTelemetry and logs unhandled request
  errors (`onRequestError`) in the same shape.
- **Agents work with fixtures, not credentials.** The repository's rules protect against
  accidental leaks: secrets only through `shared/env.ts`, `.env` files ignored, every port with
  a fixture provider, no test reaching a live API. An agent (or a developer) builds and tests with
  the fixture providers and the stub session, which need no secret. Real credentials exist only in
  a separate, limited context (the deploy pipeline, a scoped environment a person opens), never in
  the working copy an agent edits. The rules catch mistakes; they are not a sandbox, so an agent
  that holds a credential can still leak it.
- **Kubernetes only when its cost is justified.** A container platform that runs an image with
  environment variables (a managed container service) covers the web process, the worker and
  the migrate job. Kubernetes comes in when several services need what only it gives, and the
  team can run it.

## 13. Enforcement

**`architecture.json` is the single source of truth:** doors with roles, modules, declared edges,
table owners, read exceptions (file + table), exemptions, clients, server-only packages, the
rules allowlist and, optionally, the `layout` of the folders, the session module, the UI's allowed and banned
packages and its icon packages. The eslint config, the architecture tests and a Mermaid diagram are all built from
it. Its JSON Schema is versioned with the scripts (section 19).

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

**Layout.** The optional `layout` block names where each folder lives, relative to `srcRoot`:
`app`, `modules`, `ui`, `shared`, `db`, `clients`, `dbClient`, `schemaRoot`, `serverShared`,
`resultFile`, `workflows`, `compositionFolders`, `worker` and `providers`. Every rule, the eslint config, the
diagram and the module generator read it through one function (`layoutOf` in
`scripts/arch/lib.mjs`); a key left out keeps its 1.0.0 default.

**Duplication rule:** no new duplication above the threshold. Extract only when the two copies
change for the same reason; otherwise rename or restructure them so they stop matching, or record a
reviewed exception with a reason. A gate must not push people into wrong shared abstractions. A
clone is keyed by its two files plus a hash of the whitespace-normalised text, not by line numbers;
a tool upgrade that changes detection is applied in its own PR that regenerates the baseline.

**Baselines.** The identity of a finding is `rule|file|target#n`: the n-th occurrence of the same
rule, file and target, so a second violation of the same kind in the same file is new.

- **Writing.** `pnpm arch:baseline:write` writes `quality/arch-baseline.json` from today's
  findings, and `pnpm knip --write-baseline` and `pnpm dup --write-baseline` do the same for the
  ratchets. They are for adopting the blueprint and for a reviewed tool upgrade. A finding of a
  never-baselinable rule is never written: the command lists it and fails.
- **Shrinking.** `pnpm arch:baseline` compares every baseline and `quality/jscpd-exceptions.json`
  with the merge base of the target branch (`BASELINE_BASE_REF`, else the remote's default branch
  from `origin/HEAD`, else `origin/main`). A file absent at the merge base is being adopted; once
  it exists, a PR may only delete lines. A file that does not parse, or a git error, fails closed.
- **Renames.** Moving a file with baselined findings goes through
  `scripts/quality/baseline-rename.mjs`, which rewrites whole path fields (never substrings) and
  records the move in `quality/baseline-renames.json`. A recorded rename counts only when the
  source existed at the merge base and the destination did not; a split that keeps the source
  file is a move of the lines that went to the new file. An unexplained rename counts as an
  addition.
- **Messages.** A failure names `file:line`, so an editor jumps to it; the baseline key itself has
  no line number, so editing elsewhere in the file does not churn it.

**Analyzer failures fail.** A crashed analyzer, an invalid report or a rule whose selection matches
no file is a failure, never a pass. Role selections (rules, services, repositories, tables, doors,
components, providers) are asserted non-empty in the real tree: `modules-declared` reports a role
that selects no file.

### Coverage matrix

Every guarantee is one of: **RD** resolved-dependency check, **SH** syntax heuristic, **BC** build
check, **BT** behaviour test, **RO** review obligation. Where a guarantee has more than one
mechanism, all are listed; where it ends in RO, that part is not enforced by a tool.

Each row states three things: **what is detected** (the mechanism and its reach), **what stays
review** (the RO part, named in the notes) and **which exceptions are allowed**. The only allowed
exceptions are the ones `architecture.json` and `quality/` record with a reason: read exceptions
(one file, one table), exemptions, the `rulesMayImport`, `uiMayImport` and `serverOnlyPackages`
allowlists, reviewed duplication exceptions and baseline lines. A rule that is never admitted to a
baseline (section 15) has no exception at all. A green run means "no detected violation outside
these exceptions", not "correct".

| Guarantee                                                                                                   | Mechanism     | Notes                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No import cycles                                                                                            | RD            | complete graph: imports, re-exports, literal dynamic imports, type imports. ArchUnitTS alone misses re-export cycles                                                                                                                                             |
| `import()` is analysable                                                                                    | RD            | non-literal dynamic imports are refused                                                                                                                                                                                                                          |
| Modules are entered only through doors                                                                      | RD            | ArchUnitTS, complete graph (re-export, dynamic) and eslint; alias, relative, indirect and mapped paths                                                                                                                                                           |
| Declared edges hold, for both doors                                                                         | RD            |                                                                                                                                                                                                                                                                  |
| Every file sits in a declared root; doors exist; declared modules exist; the policy names no removed module | RD            | `roots-classified`, `modules-declared` (edges, table owners and `sessionModule` naming an undeclared module), eslint `no-unknown-files`                                                                                                                          |
| Doors expose only what their role allows                                                                    | RD + SH       | resolved export targets; no `export *`, aliases, declarations, repositories, tables                                                                                                                                                                              |
| A browser door or client component reaches no server code or secret                                         | RD + BC       | runtime closure; Next's `server-only` build error is an independent guard                                                                                                                                                                                        |
| Rules are pure: imports and closure                                                                         | RD            | allowlisted closure                                                                                                                                                                                                                                              |
| Rules are pure: clock, randomness, env, network, globals                                                    | SH, partly RO | `Date`, `Math.random`, `process`, `fetch`, `crypto`, …; arbitrary JavaScript purity cannot be proved                                                                                                                                                             |
| `src/ui` and `src/shared` stay generic; components never touch persistence                                  | RD            | `shared-no-modules`, `shared-no-clients`, `ui-leaf`, `components-no-persistence`                                                                                                                                                                                 |
| `src/ui` is a leaf: only `src/ui` and `uiMayImport` packages                                                | RD            | `ui-leaf`, resolved graph and eslint                                                                                                                                                                                                                             |
| Providers are composed once                                                                                 | RD + SH       | `providers-composed-once`: `*Provider` elements and imports of the providers file                                                                                                                                                                                |
| Icons have one door; global CSS has two owners                                                              | RD            | `icons-one-door`, `global-css-owners`                                                                                                                                                                                                                            |
| No door is a client boundary                                                                                | SH            | `doors-no-client-directive`; an unneeded `"use client"` on a component is RO                                                                                                                                                                                     |
| Banned packages stay out; stories stay out of production code                                               | RD            | `banned-packages` (package.json and imports), `stories-leaf`                                                                                                                                                                                                     |
| User-visible text comes from messages                                                                       | SH + RO       | `copy-from-messages` over JSX text and user-visible attributes; copy built in code is RO                                                                                                                                                                         |
| UI is accessible                                                                                            | BT + RO       | axe over every page, Storybook a11y; keyboard use and contrast in every theme are RO                                                                                                                                                                             |
| `src/shared` does no I/O: no session reading, no database driver                                            | RD            | `shared-no-io`: no server-only package but `server-only`                                                                                                                                                                                                         |
| `proxy.ts` and `instrumentation.ts` import no module                                                        | RD            | `roots-no-modules`; `worker.ts` may import server doors                                                                                                                                                                                                          |
| Composition folders take `src/ui`, browser doors and props only                                             | RD            | `composition-folders`: `app/**/_shell`, `app/**/_components`, runtime edges                                                                                                                                                                                      |
| Declared edges have no cycle                                                                                | RD            | `declared-edges-acyclic`, one finding per edge, so a brownfield cycle is baselined edge by edge                                                                                                                                                                  |
| Nothing imports `src/app`; app never touches persistence                                                    | RD            |                                                                                                                                                                                                                                                                  |
| Only the owner imports its table files                                                                      | RD            | plus `src/db` and declared read-exception files                                                                                                                                                                                                                  |
| Tables are declared, owned by the folder's module, defined once                                             | SH            | literal `pgTable` in flat `*.tables.ts` only; aliased builders, subfolders and raw DDL are RO                                                                                                                                                                    |
| Schema composition is complete                                                                              | RD            | `src/db/schema.ts` imports every table file                                                                                                                                                                                                                      |
| A read exception is one file, one table, read-only                                                          | RD + SH       | named import, no write call, no raw SQL; a raw-SQL write elsewhere is RO                                                                                                                                                                                         |
| Cross-module foreign keys exist                                                                             | BT + RO       | database test; the migration is reviewed by both owners                                                                                                                                                                                                          |
| Providers are imported only inside their client folder                                                      | RD            |                                                                                                                                                                                                                                                                  |
| No test reaches a live API                                                                                  | BT            | global `fetch` stubbed to throw                                                                                                                                                                                                                                  |
| Every operation declares an access policy                                                                   | BT            | policy registry test over every server door the policy declares, so a new module is checked without editing the test; `access-declared` (syntax, also `export { fn }`) is diagnostic only                                                                        |
| User operations refuse anonymous callers with a typed error                                                 | BT            |                                                                                                                                                                                                                                                                  |
| The resource permission inside a user operation is correct                                                  | BT + RO       | one behaviour test per operation (another user's resource); the code is reviewed                                                                                                                                                                                 |
| System operations are called only from route handlers and the worker                                        | RD + SH       | by imported name, across modules, inside a module and in the same file; namespace imports refused; user operations may not call them; a workflow that calls one is itself callable only from a route or the worker. A call through a plain helper function is RO |
| Webhook and cron routes verify the caller                                                                   | BT            | signature and secret tests                                                                                                                                                                                                                                       |
| Actions are thin                                                                                            | RD + RO       | no persistence imports, `"use server"` only in app; "no business logic" is RO                                                                                                                                                                                    |
| One owner of commit and rollback: only services open transactions                                           | SH            | `transaction-discipline`: `inTransaction` only in `*.service.ts`, `db.transaction()` only in `src/db`                                                                                                                                                            |
| Transactions: gateway, no external call, no nesting, `tx` passed on                                         | SH + BC       | direct calls only; the `Tx` type makes a missing transaction a compile error                                                                                                                                                                                     |
| A callee given `tx` really uses it; isolation and retry assumptions                                         | RO            |                                                                                                                                                                                                                                                                  |
| State safety: conditional updates, lost updates, retries                                                    | BT            | the worked slice; concurrency tests commit on separate connections against Postgres                                                                                                                                                                              |
| Jobs call providers with a stable idempotency key                                                           | BT + RO       | the cancel/refund retry test; that every new job derives its key from a persisted id is RO                                                                                                                                                                       |
| A multi-transaction process names its intermediate states and recovery                                      | RO            | the `recovery` answer of the workflow header                                                                                                                                                                                                                     |
| Webhooks: duplicates, out of order, late, before linkage, unmatched                                         | BT            | the worked slice                                                                                                                                                                                                                                                 |
| A cross-module workflow documents its retry and recovery behaviour                                          | SH + RO       | the header block of every `app/_workflows` file and of any action or route that sequences two modules; no two workflows share the same answers; whether they are true is RO                                                                                      |
| Server files start with `import "server-only"`                                                              | SH + BC       | as the first statement                                                                                                                                                                                                                                           |
| No new unused code, no new duplication                                                                      | build check   | knip and jscpd ratchets                                                                                                                                                                                                                                          |
| Baselines only shrink; policy changes are visible                                                           | build check   | merge-base comparison; governance output                                                                                                                                                                                                                         |

**Adversarial acceptance cases** (each is a fixture or test, not only one violation per rule):
same-module imports (rules or a component importing their own repository), a repository re-exported
through a door, an alias-mapped path to a server file in a client file, a transitive client helper,
a cycle closed by a re-export, an impure helper behind a rules file, a lost conditional update, a
webhook before linkage, an unknown file re-exporting a repository, an action calling a system
operation. Fixtures assert the intended rule **only**, assert the specific message, and each has a
clean twin (an erased `import type`, a string that is not a directive prologue) that must pass.

## 14. Non-negotiables

1. No import cycles.
2. Modules are entered only through their two doors, along declared edges.
3. Rules files are pure and deterministic.
4. Every table has one owner; only the owner writes; cross-module reads only as declared exceptions.
5. External calls never run inside a database transaction.
6. Every service operation declares its access policy; actions are thin; system operations are
   reachable only from verified routes and the worker.
7. Browser code cannot reach server code or secrets.
8. Vendors only through their port; every port has a fixture provider; no test reaches a live API.
9. Cross-module processes have an owner and defined retry and recovery behaviour.
10. UI atoms live in `src/ui` (the project's own design system); business components live in their module.
11. One policy file; every rule has a deliberate-violation fixture.

Non-negotiable means **a new violation always fails**. It does not mean "never admitted to a
baseline": see section 15.

## 15. Greenfield and brownfield

- **Greenfield:** every rule is a hard failure from the first commit; the baselines are empty. Start
  from the module generator (`pnpm new:module`: doors, service, repository, rules with a test,
  tables, schema, a component and the policy entry). Build one complete slice first (capture, save,
  show to an authorised user), then add capabilities.
- **Brownfield:** add the policy and tools first, with a `layout` block if the folders differ from
  section 4. Existing violations of **any** rule, the non-negotiables included, may be frozen as
  approved migration debt in `quality/arch-baseline.json` (one line per occurrence, written by
  `pnpm arch:baseline:write`; the ratchets take `--write-baseline`). The same baseline feeds the architecture tests and, as exact
  file-to-file allow policies, eslint. Additions always fail; a fixed violation deletes its line; a
  line whose violation is gone fails as stale. Then move in this order: doors, rules files, data
  ownership, workflows.
- **Never admitted to a baseline**, even in a brownfield app: server code or secrets in a browser
  bundle (`client-runtime-closure`, `public-door-closure`, `server-only-in-server-files`). That is
  a leak, not migration debt.
- A baseline change is reviewed by the owners of the policy (CODEOWNERS), is compared with a trusted
  base revision, and shows up in the governance output.

## 16. Add later, not now

| Add                                               | When                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Subfolders inside a module                        | it passes about ten files                                                                                                                 |
| Separate read functions (`<x>.queries.ts`)        | pages need joined or aggregated reads that do not fit the service                                                                         |
| Repository interfaces                             | a second backend appears or a test needs to swap it                                                                                       |
| Explicit caller parameter on shared operations    | an action and a job need the same operation                                                                                               |
| Events between modules                            | a module must react without the publisher knowing who listens                                                                             |
| Outbox table                                      | an event must survive a crash between commit and publish                                                                                  |
| Numeric coupling gates                            | months of report data show a threshold that would have caught real problems                                                               |
| Packages in a monorepo                            | a second app needs the same modules                                                                                                       |
| Leaf modules (`leafModules`)                      | a module must import only a fixed list of folders; the first adopting app uses it                                                         |
| File-naming rules (`naming`)                      | a convention keeps being broken in review; the first adopting app uses it                                                                 |
| A file-size ceiling (`fileSize`)                  | files grow past what a reviewer reads; a ceiling to lower, never to raise                                                                 |
| Test-folder rules (`testDirs`)                    | production code starts importing test helpers                                                                                             |
| A readiness route in the template                 | the first deploy needs one; section 12 says what it checks                                                                                |
| Visual regression (Playwright `toHaveScreenshot`) | a designer reviews UI changes or a second app shares `src/ui`; baselines generated in the CI container, never in the template             |
| `ui/primitives` and `ui/composed` folders         | `src/ui` passes about twelve files; composed may import primitives, never the reverse                                                     |
| `packages/ui` in a workspace                      | a second app needs the same UI; the leaf rules move with it                                                                               |
| Design tokens as DTCG JSON                        | a non-CSS consumer appears (Figma sync, native, email)                                                                                    |
| More UI checks                                    | a diagnostic for a needless `"use client"`, raw colour literals outside `ui/styles`, `fetch` to the app's own API from a server component |

## 17. Deliberately skipped

- Ports for the database, adapters, commands, use-case classes.
- DI containers (tsyringe, inversify).
- CQRS and event sourcing.
- Barrels that re-export whole folders.
- Paid quality-score services; the tools above are free.

## 18. Decision log

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
| D13 | Pilot in one real app, then reuse through the template (section 19)                                                                | org-wide at once                                                              |
| D14 | Named workflows with a four-question header; durable intent before acknowledging; jobs and inbox tables where durability is needed | function injection everywhere; an outbox for every effect                     |
| D15 | Thin `"use server"` actions in `app/`; an explicit access policy per operation inside services                                     | checks in pages or `proxy.ts`; trust by function name; actions inside modules |
| D16 | A service passes its transaction (a `Tx`) to another module's service for DB-only writes; never external calls inside              | transactions never cross modules                                              |
| D17 | Each project owns its UI: `src/ui` is the project's own design system; business components live in modules                         | a central design system dependency in the public template                     |
| D18 | `architecture.json` is the architecture description; diagrams are generated and checked for staleness                              | a formal ADL; hand-drawn diagrams as the source                               |
| D19 | Background work in a worker process (`src/worker.ts`) on a Postgres queue (graphile-worker), calling job operations                | a queue inside the web process; a separate broker (Redis, SQS); pg-boss       |
| D20 | Cross-module workflows in `app/_workflows/`, one header block per workflow, no two alike; actions and routes call one              | workflows hidden in actions and routes; a header found anywhere in the file   |
| D21 | Composition folders (`_shell`, `_components`) in `app/`: `src/ui`, browser doors and props only                                    | page parts that call server doors; page parts inside `src/ui`                 |
| D22 | `shared/auth.ts` holds the session type and pure checks; reading the session lives in a module (`accounts`), passed to operations  | an auth library in `shared/`; a global session reader bound at start          |
| D23 | An optional `layout` block makes every folder path configurable; the defaults are the 1.0.0 paths                                  | hard-coded paths; a fork of the scripts per app                               |
| D24 | Unit and service tests colocated with the code; `tests/` only for what spans files                                                 | a `test/` tree mirroring `src/`                                               |
| D25 | `src/ui` is a leaf with a per-file public path; layer-first folders are refused with a hint where each belongs                     | a `ui/index.ts` barrel; top-level hooks, contexts, stores, utils folders      |
| D26 | Tailwind v4 over semantic CSS variables, `cva` for variants, shadcn layout aliased into `src/ui`, Radix as the headless base       | plain CSS only (documented as the alternative); a component library package   |
| D27 | Providers composed once in `app/_shell/providers.tsx`; navigation in `app/_shell/nav.ts`; one icon door; global CSS in two places  | providers in any layout; a `config/` folder; icon packages imported anywhere  |
| D28 | Every app is translatable from the first commit: next-intl, English by default, typed keys, no hard-coded copy                     | adding i18n later; strings in components                                      |
| D29 | axe on every page and Storybook with the a11y addon in the template; screenshot baselines later                                    | screenshot baselines in the template; no automated accessibility check        |
| D30 | `bannedPackages` with reasons: axios and the Redux family in the template                                                          | a lint rule per package; review only                                          |

## 19. Rollout and versioning

1. **Pilot** in one real application, adopting the template and the policy file.
2. **The pilot is done when:** four weeks pass without a new violation, baselines are down at least
   30 %, every rule has a working deliberate-violation fixture, and the team calls the friction
   acceptable.
3. **Then reuse:** other apps copy the template at a known release and write their own
   `architecture.json`; improvements flow back into this blueprint.
4. **Versioning.** The blueprint, `architecture.schema.json` and the scripts share one version
   (`template/CHANGELOG.md`). `architecture.json` carries `$schemaVersion`; the scripts refuse a
   different major version. An app upgrades by copying the new scripts and following the changelog.
5. Python apps can get the same blueprint with import-linter (rules) and radon (complexity). A
   Python blueprint will live next to this one; until then a Python runtime inside a Next.js app
   goes in `services/<name>/` (template `services/README.md`).

## 20. Sources

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
- David L. Parnas, On the criteria to be used in decomposing systems into modules (1972): https://dl.acm.org/doi/10.1145/361598.361623
- Robert C. Martin, Screaming Architecture: https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html
- Alexis King, Parse, don't validate: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
- Gary Bernhardt, Functional core, imperative shell: https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell
- Sandi Metz, The Wrong Abstraction: https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction
- Martin Fowler, MonolithFirst: https://martinfowler.com/bliki/MonolithFirst.html
- Martin Fowler, Transaction Script: https://martinfowler.com/eaaCatalog/transactionScript.html
- Martin Fowler, Parallel Change (expand and contract): https://martinfowler.com/bliki/ParallelChange.html
- Next.js, Authentication: https://nextjs.org/docs/app/guides/authentication
- Next.js, Self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Next.js, Instrumentation: https://nextjs.org/docs/app/guides/instrumentation
- Vercel, How we optimized package imports in Next.js: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
- React, `"use server"`: https://react.dev/reference/rsc/use-server
- graphile-worker: https://worker.graphile.org/
- Next.js, Server and Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Tailwind CSS, theme variables: https://tailwindcss.com/docs/theme
- Tailwind CSS, detecting classes in source files: https://tailwindcss.com/docs/detecting-classes-in-source-files
- shadcn/ui: https://ui.shadcn.com/docs
- Radix Primitives, composition: https://www.radix-ui.com/primitives/docs/guides/composition
- Brad Frost, Atomic Web Design: https://bradfrost.com/blog/post/atomic-web-design/
- Redux Toolkit, setup with Next.js: https://redux.js.org/toolkit/usage/nextjs
- next-intl, App Router: https://next-intl.dev/docs/getting-started/app-router
- Storybook for Next.js: https://storybook.js.org/docs/get-started/frameworks/nextjs
- Storybook, accessibility testing: https://storybook.js.org/docs/writing-tests/accessibility-testing
- Playwright, accessibility testing: https://playwright.dev/docs/accessibility-testing
- Playwright, visual comparisons: https://playwright.dev/docs/test-snapshots
