---
name: structure
description: The stack-agnostic layout and boundaries of a product: modules, operations, data ownership, delivery layers and the quality ratchet.
read-when: setting up a new product, adding a module, a table, an operation or a delivery layer, or when a boundary check fails.
skip-when: changing copy, styling or content that touches no module or boundary.
---

# Structure

Build every product as a modular monolith: one deployable, split inside into modules that each own one business capability and its data. Delivery layers (routes, actions, webhooks, jobs, MCP) are thin and call modules. The one idea: an agent can change one capability without silently changing another capability's data or bypassing its rules, and tests, not prose, keep it that way.

## Rules

### Modules

- **STR-1 One module per business capability.** Name it after the domain (orders, billing, accounts), not after a framework or its first consumer. Opening the modules folder shows what the product does.
- **STR-2 A module has a public door and a private inside.** The door lists, by name, everything other code may use. Repositories, tables and helpers stay private. No wildcard re-exports. Inside a module use relative imports, never its own door.
- **STR-3 Dependencies are declared, point one way and never cycle.** A cycle means two modules are one module with two names. Declare allowed edges in one machine-readable policy file.
- **STR-4 A module has a fixed inside.** Service (operations), repository (queries), pure rules, input schemas, types and typed errors, table definitions. Start flat, add subfolders past about ten files.
- **STR-5 Rules are pure.** Pricing, eligibility and allowed transitions are functions of their inputs: no database, network, clock, randomness or environment. The service passes those in. Pure code is tested without mocks.

### Operations

- **STR-6 Every operation declares its access.** One of `user` (signed-in caller, names the resource permission it checks), `public` (anyone, declares validation and abuse controls), `webhook` (called only by a route that verified the sender) or `job` (called only by a trusted scheduler or worker). A function's name grants nothing. Reads are operations too.
- **STR-7 System operations are called from the outside edge only.** `webhook` and `job` operations are never called by a page, action, component or user operation.
- **STR-8 Expected failures are typed results, unexpected ones throw.** Validation, not found, conflict, not allowed and not signed in come back as a result whose error is a closed set of codes, so the UI branches on the kind. Bugs and outages throw.
- **STR-9 Parse at the edge, then trust the types.** Untrusted input (forms, webhook bodies, env) is parsed once where it enters. Code behind the edge does not re-check it.
- **STR-10 State changes are safe under concurrency and retries.** Status is an enum. Transitions are conditional updates on the expected current state, and the code checks that a row changed. A lost update is reloaded, never reported as success.

### Data

- **STR-11 One owning module per table.** Only the owner writes it, through its repository. Other modules ask the owner. A direct read by another module is a declared exception: one file, one table, a reason.
- **STR-12 Foreign keys across modules are kept.** Do not drop a constraint to avoid an import edge. Owners of both tables review it together.
- **STR-13 One place owns each transaction.** The service operation that needs atomicity opens it. Repositories run inside the transaction they are given and never open, commit or roll back one.
- **STR-14 No external call inside a transaction.** The transaction records what must happen, a retryable job does it. See [clients](clients.md) and [data-and-migrations](data-and-migrations.md).
- **STR-15 A process that spans modules is a named workflow.** One owner, and it answers four questions in its header: is it retry-safe, what happens on duplicates, how does it recover, does it survive a restart. A workflow sequences operations, each its own atomic step, and never opens a transaction.

### Delivery layers

- **STR-16 Routes, actions, webhooks, jobs and MCP tools are thin.** Each parses input, reads the session, calls one operation or one workflow, and returns a small result. No database access and no business rules there. MCP is one more layer on the same operations, see [mcp](mcp.md).
- **STR-17 Raw records never reach the client.** Operations return domain records, the delivery layer maps them to small DTOs.

### Shared code

- **STR-18 `shared/` is generic and does no I/O.** Session type, access helper, result type, the one env reader. It imports no module and no client.
- **STR-19 `ui/` is the only home of visual building blocks.** Components, styleguide and theme. It knows no business noun and is a leaf. A component that knows a business noun lives in its module. See [design](design.md).
- **STR-20 `clients/` holds one folder per networked external service.** See [clients](clients.md).
- **STR-21 `i18n/` holds routing, message loading and typed keys.** It imports no module. See [i18n](i18n.md).
- **STR-22 No junk-drawer folders.** Top-level `utils`, `helpers`, `hooks`, `types`, `lib` and `common` group code by what it is, not what it is for. Put the code in the module or the shared folder it belongs to.
- **STR-23 Single-use helpers stay beside their caller.** Extract on the second consumer. Duplication is cheaper than the wrong abstraction.

### Boundary map

- **STR-25 `boundary-map.yaml` sits at the repo root, next to the architecture policy file.** It is the Decision4 boundary map (v1, see [sources](sources.md)): it sets a floor class per path, config key, data store, external API, credential and environment, so a class comes from where the ground changes, not from mood. It validates against the pinned schema URL (see [ci](ci.md)).
- **STR-26 Typical floors.**
  - Migrate: database schema and migrations, published contracts (HTTP API schema, events, MCP tools, job payloads), auth configuration, public URLs.
  - Answer: production data and its credentials, legal pages, user email addresses, payments, deletion jobs, production IAM and DNS, signing keys.
  - Repair: an internal module, `clients/`, shared config. Undo: copy, styling, tests, docs.
- **STR-27 The map marks ground, not decisions.** Each entry gives the floor, one line of put-right and the answerer. An agent proposes a class at or above the floor and logs a map gap on unmapped ground. Changing the map needs the owner's review.

### Size

- **STR-24 Files stay under about 400 lines.** Split by responsibility when a file passes it. No dead code: unused files, exports and dependencies fail the build.

## How to apply

Generic layout (names are defaults, the stack blueprint maps them to real folders):

```text
src/
  app/            delivery layer only: pages, actions, route handlers, webhooks, MCP
    _workflows/   named cross-module processes
  worker/         job entry point, calls job operations
  modules/
    orders/
      door        public surface, listed by name (browser-safe and server-only variants)
      service     operations with declared access, transaction boundary
      repository  this module's queries, private
      rules       pure decisions
      schema      input parsing
      types       result and error codes
      tables      tables this module owns
      components  business components built from ui/
  clients/<svc>/  interface, factory, providers (real, fake, noop)
  shared/         result, session, access, env: generic, no I/O
  ui/             components, styleguide, theme
  i18n/           routing, messages, typed keys
policy file       modules, allowed edges, table owners, read exceptions, exemptions
boundary-map.yaml  Decision4 floors by path, key, store, API, credential, environment
quality/          baselines (only shrink)
tests/            architecture, integration, e2e
```

New product:

1. Write the policy file first: modules, edges, table owners. An empty module list is fine. Write `boundary-map.yaml` with the typical floors of STR-26 for the ground the product has.
2. Add the architecture tests before the first feature, so every rule is a hard failure from the first commit and the baselines are empty.
3. Add a module by creating its door, service, repository and tables, then declare its edges and its tables in the policy file.
4. Wire delivery layers last, each calling one operation.

Changing later: touch one module at a time. If a change needs another module's data, call its operation or add a declared read exception. Moving a file with baselined findings goes through the rename procedure, not a hand edit of the baseline.

## Checks

Enforced automatically, in the required CI job:

- `boundary-map.yaml` validates against the pinned schema, and every module path, table and credential the policy names is covered by an entry or a logged gap.
- Imports respect doors, declared edges and the one-way rule, with no cycles at module and file level.
- Only a table's owner imports its definition and writes it. Read exceptions match their declared file and table exactly.
- Delivery layers contain no database access. System operations are called only from the outside edge.
- Every operation declares an access policy. A test lists them all and fails on a missing one.
- Rules files import nothing impure. `shared/` and `ui/` import no module, client or database.
- No external call and no nested transaction inside a transaction callback.
- File size limit, unused code, duplicated code.
- Architecture tests include deliberate-violation fixtures to prove each rule fails when it should.

The quality ratchet: new violations fail the build. Existing ones are frozen in a baseline file, one line per finding, and a PR may only delete lines from it. The check compares with the merge base of the target branch and fails closed on a parse or git error. A tool upgrade that changes detection goes in its own PR that regenerates the baseline. A greenfield product has an empty baseline. Leaks of server code or secrets into browser code are never baselined.

Left to review: that a callee given the transaction really uses it, isolation level choices, indirect call paths, and whether a module name matches the domain.

## Mistakes to avoid

- Business logic placed in a route to satisfy an import checker. The check passes and the boundary is gone.
- Dropping a foreign key so two modules need no shared import.
- A repository importing an HTTP error type because the first consumer was a route.
- A baseline that grows "just this once". It never shrinks again.
- A policy file edited to allow a new edge without a reason recorded next to it.
- Checks written but not wired into the required CI job. They are decoration.
- Inventing ports and interfaces for the database or for code with one implementation.
- Top-level folders named after technical roles, so every feature is spread across all of them.
- A map with one catch-all Repair entry, so nothing was ever classed higher.
