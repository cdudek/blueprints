---
title: FastAPI application architecture blueprint
status: approved
version: 1.0.0
audience: engineers and agents building or changing a FastAPI service
stack: FastAPI, Python 3.14, Postgres (async SQLAlchemy 2, psycopg 3, Alembic), Procrastinate, pydantic
template: ./template (runnable, carries every rule below as code)
---

# FastAPI application architecture blueprint

## 1. Summary

Build every service as a **modular monolith**. Each business capability is a module with a small,
predictable inside: a service, a repository, pure rules, schemas, models and errors. FastAPI is a
thin outer layer: a route parses input, opens one transaction, calls one operation and returns a
schema.

The separation is the one hexagonal and clean architecture aim for, without their vocabulary: no
ports for the database, no command classes, no dependency-injection container. Plain functions
that take a transaction and the caller, and direct imports through a door.

One test decides whether it works: **a developer or agent can change one capability without
silently changing another capability's data, bypassing its rules, or hiding business logic in
routes to satisfy an import checker.**

A policy file and CI checks keep it that way. The `template/` folder is a runnable service that
follows this document: an `orders` module, a `billing` module that charges a payment provider
through a worker, and every rule below as code and as a test. Where a rule can only be reviewed,
section 9 says so. Section 2 gives the principle behind each rule.

## 2. Principles

The rules in this document are not a style. Each one carries out a principle that has a source
and a reason. When a rule seems to get in the way, check it against its principle: either the
principle does not apply to the case (record the exception in the policy log with the reason), or
the code is the thing that has to change.

**Cut along decisions that are likely to change.** A module hides one decision (how orders are
priced, how a payment is taken) behind a small interface, so that changing the decision changes
one module. Parnas showed in 1972 that this beats cutting along the steps of a flowchart. Carried
out by: modules in `src/app/modules/<capability>`, the door `__init__.py`, the door contracts.

**The top level shows the domain.** Opening `src/app/modules` should tell a reader what the
service does (orders, billing), not which framework it uses. Framework folders (`api/`, `db/`)
sit beside the modules, not around them. Source: Robert C. Martin, "Screaming Architecture".
Carried out by: the layout in section 4, the policy test that every module folder is declared.

**Dependencies point one way and never cycle.** A cycle means two modules can only change
together, so they are one module with two names. Dependencies point from the caller to the
callee, and the layers form a graph without cycles. Source: the acyclic dependencies principle
(Robert C. Martin). Carried out by: `layers` in `architecture.toml`, the `layers` contract.

**A module has a small public surface and keeps the rest private.** Everything another module may
use is listed by name in a door; repositories, models and helpers stay private, so the inside can
change without telling anyone. Source: Parnas (information hiding); Spring Modulith's module
verification. Carried out by: the door contracts, `door_shape`, `door_exports`.

**Each module owns its data.** One module owns each table and is the only one that writes it.
Other modules ask the owner through its door. Shared tables are shared decisions, and shared
decisions are what modules exist to avoid. Carried out by: `tables` in `architecture.toml`,
`table_owners`.

**Boundaries need a tool, adopted with a baseline that only shrinks.** A boundary that only lives
in a document erodes with the first deadline. Every rule is a check that fails the build; an
existing codebase freezes today's violations in a baseline and may only remove lines from it.
Source: ArchUnit-style architecture tests; ratcheting as practised with linters. Carried out by:
`.importlinter`, `tests/architecture/`, `make arch-baseline-write`, `baseline_shrinks.py`.

**Parse at the edge, then trust the types.** Untrusted input (a request body, a header, an
environment variable) is parsed once, where it enters, into a typed value; code behind the edge
does not check it again. Source: Alexis King, "Parse, don't validate". Carried out by: pydantic
schemas in `schemas.py` with `extra="forbid"` on input, `Settings` as the only reader of the
environment, the request-ID check in `api/middleware.py`.

**Pure core, side effects at the shell.** Decisions (allowed transitions, retry or give up) are
pure functions of their inputs; the service around them reads the clock, the database and the
network and passes the results in. The core is tested without mocks. Source: Gary Bernhardt,
"Functional core, imperative shell". Carried out by: `rules.py`, `rules-pure`, `pure_rules`.

**Abstract only what really varies.** A port exists for a third-party service, because the vendor,
the fixture and the no-op provider really differ. There is no port for the database, no
repository interface and no use-case class, because nothing varies there yet. Duplication is
cheaper than the wrong abstraction. Source: Sandi Metz, "The Wrong Abstraction". Carried out by:
`src/app/clients/<service>`, section 15 (add later).

**Don't distribute early.** One deployable with strong module boundaries keeps refactoring cheap;
a service boundary is a network call, a deploy and a contract to version. A second runtime (the
worker) is added for a runtime reason, not for structure. Source: Martin Fowler, "MonolithFirst".
Carried out by: one package with a `web`, a `worker` and a `migrate` entry point.

**Python specifics.** The language adds these rules:

- **The door is `__init__.py`, and a convention plus checks make it a boundary.** `__all__` only
  decides what `from pkg import *` imports (Python tutorial, "Importing from a package"); it does
  not stop `from app.modules.orders.repository import x`. The boundary comes from the import
  contracts and the door tests. A door holds imports from its own module and `__all__` only: no
  star imports, no aliases, no declarations. `modules/__init__.py` stays empty. Carried out by:
  the door contracts, `door_shape`, `door_exports`.
- **Role doors exist only when a module needs them.** `router.py` (HTTP, imported only by
  `app.api`), `system.py` (operations for jobs and webhooks), `jobs.py` (worker tasks). `orders`
  has only `router.py`; `billing` has all three. Carried out by: the role-door contracts.
- **One owner per transaction** (section 6).
- **`Depends` at the edge only.** Routers and `shared/http.py` use it; services get `tx` and
  `principal` as arguments. There is no container. Carried out by: `no-framework-in-core`.
- **Expected failures are exceptions with a closed code.** `DomainError` subclasses with
  `code: ClassVar[Literal[...]]` and a `kind`, exported by the door and mapped by `api/errors.py`
  to problem-detail JSON (RFC 9457). Carried out by: `door_exports`, the HTTP tests.
- **ORM models are private.** A foreign key across modules names the table
  (`ForeignKey("orders.id")`), never a `relationship()`; data crosses a door as a schema. Carried
  out by: the door contracts, which protect `models.py`.
- **`Settings` is the only reader of the environment;** credentials are `SecretStr` (section 11).
- **One package, not a flat `src/`.** pytest's good practices and uv's application layout use
  `src/<package>/`. One namespace keeps `config`, `clients`, `shared` and `modules` (all taken on
  PyPI) from becoming top-level import names, and keeps the import contracts to one root. The cost
  is one path segment. Section 13 maps it to a flat `src/` for teams with that house rule.

### Where the sources disagree

- **Layers or slices.** Layered architecture groups code by technical role; vertical slices group
  it by feature. The blueprint slices first (a module per capability) and layers inside the slice
  (service, repository, rules), because the slice is the unit of change and the layers keep the
  slice readable.
- **Rich model or transaction script.** Domain-driven design puts behaviour on entities; the
  transaction script puts it in a procedure per operation. The blueprint uses transaction scripts
  (operations) over plain records, with the decisions pulled out into pure rules.
- **Events or direct calls.** Events decouple the publisher from its listeners; direct calls keep
  the flow visible and the failure local. The blueprint calls directly through doors and sequences
  two modules in a named workflow. An event comes in only when a module must react without the
  publisher knowing who listens (section 15).

## 3. Why this shape

| Option | Our tradeoff |
| --- | --- |
| Hexagonal, clean, onion | Same separation, but ports for the database, use-case classes and a container cost more than they buy. Ports only for third-party services. |
| Routers that query the database | Fast to write, but authorization, transactions and data ownership end up spread over handlers. |
| Layered (n-tier) by technical role | Business rules end up depending on the database layer; a change crosses every layer. |
| One service per capability | A network call, a deploy and a versioned contract for every boundary, before anyone knows where the boundaries are. |
| **Modules with service, repository, rules, behind doors** | Fowler's Service Layer and Repository inside each capability, the import graph checked by a tool. Familiar to anyone who used Django apps, Rails or Spring. **Chosen.** |

## 4. Repository layout

```text
template/
  pyproject.toml, uv.lock, .python-version   dependencies (dev group) and all tool config; 3.14
  Makefile                                   entry points; includes tools/common/make
  .pre-commit-config.yaml                    hooks run by prek
  architecture.toml, architecture.schema.json  the policy and its editor schema
  .importlinter                              generated from the policy
  openapi.json                               HTTP contract snapshot; drift fails
  alembic.ini, alembic/                      async env.py, schema_history hook, PHASE markers
  Dockerfile, .dockerignore, compose.yaml    web, worker, migrate targets; local Postgres
  .env.example                               setting names, no values
  secrets.manifest.json, secret-versions/    declared secrets and pinned versions
  tools/common/                              vendored common 1.0.0
  .claude/settings.json, AGENTS.md, CLAUDE.md  agent rules
  quality/                                   arch-baseline.toml, policy-log.toml
  scripts/arch/, scripts/quality/            generator, baseline writer, ratchets, review list
  docs/                                      worked-slice.md, deploy.md
  .github/workflows/ci.yml                   make check and the image smoke test
  tests/unit/, integration/, architecture/, tooling/, fixtures/arch/<rule>/
  src/app/
    main.py, worker.py, schema.py            declared roots: web, worker, the full schema
    api/                                     mounting, error mapping, middleware, probes, workflow routes
    workflows/place_order.py                 owns its transaction; four-question docstring
    modules/orders/                          __init__, router, service, repository, rules, schemas, models, errors
    modules/billing/                         the same plus system.py and jobs.py
    clients/payments/                        base.py (Protocol), factory.py, providers/{real,fixture,noop}.py
    db/                                      engine, Base, Tx and in_transaction(), job queue, schema_history
    shared/                                  auth (Principal), access (@operation), http (Depends), errors
    config/                                  settings, logging (redaction), telemetry
```

Layers, top to bottom (`architecture.toml`): the roots (`main`, `worker`, `schema`), `api`,
`workflows`, `modules.billing`, `modules.orders`, then `clients` and `shared`, `db`, `config`. A
layer imports only the layers below it. `schema.py` is the one composition root: it imports every
module's `models.py` so Alembic sees the whole schema.

## 5. The rulebook

- **A module** is a folder in `src/app/modules/` declared in `architecture.toml` with its tables
  and role doors. The policy test fails when a folder or a role-door file is not declared.
- **A door** (`__init__.py`) imports from its own module and lists `__all__`. It exports
  operations (functions carrying `@operation`), schemas (`BaseModel` subclasses from
  `schemas.py`) and errors (`DomainError` subclasses from `errors.py`), nothing else.
- **An operation** is a function in `service.py` (or `system.py`) decorated with
  `@operation(access="user" | "system")` (`shared/access.py`). It takes `tx: Tx` first and, for a
  user operation, the caller's `Principal`. A user operation checks the resource itself: another
  customer's order reads as missing (`orders.get_order`, tested in
  `tests/integration/test_orders_repository.py`).
- **A route** lives in the module's `router.py`, is mounted in `api/mount.py` and depends on
  `CurrentUser` (`shared/http.py`). It opens one `in_transaction()`, calls one operation and
  returns a schema. A route that starts a workflow lives in `api/` (`api/orders.py`).
- **A workflow** (`src/app/workflows/`) sequences modules, owns its transaction, and answers four
  questions in its docstring: retry-safe? duplicates? recovery? survives a restart?
- **A repository** takes `tx`, never commits, and changes state with conditional updates
  (`set_status_if`, `move_if`) that report whether they won. A lost update is reloaded and
  decided again, never reported as success.
- **Rules** are pure: no database, clock, randomness or environment.
- **A client** (`src/app/clients/<name>/`) has a `Protocol` port, a factory and `real`, `fixture`
  and `noop` providers. `fixture` is the default outside production; production refuses
  `fixture` and `noop`.
- **Authentication** in the template is a marked shortcut: `require_user` trusts an `X-User-Id`
  header outside production and refuses every request in production. Replace its body with your
  identity provider's token check.

## 6. Data ownership and transactions

**One owner per transaction.** Exactly one place owns commit and rollback per atomic use case:
the entry point. That is a router handler calling one operation, a workflow, or a job in
`jobs.py`. It opens `async with in_transaction() as tx:` (`db/transaction.py`) and passes `tx`
down. Leaving the block commits; an exception rolls back. Operations and repositories take `tx`
and never open, commit or roll back. `in_transaction()` inside an open transaction raises, so
there is no hidden nesting (`tests/integration/test_transaction.py`). `orders.create_order()`
followed by a failing `billing.request_payment()` is therefore one transaction, owned by
`place_order`, and both writes roll back together (`tests/integration/test_place_order.py`).

**A job is deferred in the caller's transaction.** `db.queue.defer_in(tx, task, ...)` writes the
job on the SQLAlchemy session's own connection, so a job commits or rolls back with the data it
belongs to; a job already waiting under the same queueing lock is skipped in a savepoint.

**Processes that span transactions** have named intermediate states, stored as a database enum,
and a resume or compensation rule per state. No transaction is open during an external call:
claim and commit, call, then record in a new transaction. Section 7 is the reference.

**Each table has one owner**, declared in `architecture.toml` and defined only in the owner's
`models.py` (`table_owners`). A foreign key across modules names the table; the owner's door is
the only way to read or change its rows.

## 7. The worked slice

`POST /v1/orders` places an order and a durable payment request in one transaction; a worker
claims the request, charges the provider outside any transaction with the request's fixed
idempotency key, and records the result. A crash anywhere leaves a named state the next attempt
resumes from. [`template/docs/worked-slice.md`](./template/docs/worked-slice.md) gives the flow,
the states and their resume rules, the retry rules and what each test proves:

- a worker that charges and dies before recording it: the stalled-job retry runs the job again;
  exactly one charge, request `succeeded`, order `paid`;
- two claims on two connections, and two racing workers: one claim, one provider call;
- a decline (`failed`, no retry), an unknown outcome then success (one charge), and the maximum
  attempts (`needs_attention`, one alert-level event).

These tests commit for real on separate connections: under Read Committed a second connection
never sees uncommitted data. Each test module gets its own database, cloned from a migrated
template with `CREATE DATABASE ... TEMPLATE` and dropped afterwards; repository tests use a
transaction per test that is rolled back.

## 8. Deploys

Expand, roll out next to the old version, shift traffic, stop the old version, wait out the
rollback window, contract in a later release. Readiness checks schema compatibility: `/readyz`
asks whether the migration the code needs (`REQUIRED_REVISION`) is recorded in `schema_history`,
which `alembic/env.py` fills through Alembic's `on_version_apply` hook. Old instances stay ready
after an expand migration; a new instance is not ready before its migration
(`tests/integration/test_readiness.py`). The exact migration state is checked by the deploy with
`alembic current --check-heads`. Job payloads change only additively, and a renamed task keeps
its old name until no old worker runs. [`template/docs/deploy.md`](./template/docs/deploy.md) is
the runbook.

## 9. Guarantees and the coverage matrix

Each row states what a tool detects, what stays review, and which exceptions are allowed. A green
run means "no detected violation outside the listed exceptions", not "correct".

How each kind of check is proven: every import contract, AST rule, reflection rule and lint rule
has a deliberate-violation fixture under `template/tests/fixtures/arch/<rule>/`, a clean twin that
must pass, and an assertion on the exact message. The ratchets, the policy checks and the secret
scan are proven in `template/tests/tooling/` against throwaway git repositories. Behaviour rows are
proven by the tests they name.

Never admitted to a baseline: role-door protection, environment reads, framework imports in
`service`, `repository` or `rules`, and transaction ownership.

A stated limit: import-linter baselines are per module pair, so a second violation of a pair in
the same file is invisible once the pair is baselined.

| Guarantee | Detected by | Not detected (review) | Allowed exceptions |
| --- | --- | --- | --- |
| Dependencies point one way: roots, `api`, `workflows`, modules (billing over orders), infrastructure | import-linter `layers` contract (`layers`) | `importlib` and string imports | brownfield baseline pairs |
| Other modules enter only through the door | import-linter `protected` contract per module over every file but the doors, every import form, direct imports (`door`); the generator reads the module folders, so a new file is protected as soon as it exists | `importlib` and string imports | brownfield baseline pairs |
| A door holds only imports from its own module and `__all__`; `modules/__init__.py` stays empty | AST (`door_shape`): no star imports, no aliases, no declarations, no re-export of another module | none | none |
| A door exports only operations, schemas and errors | reflection (`door_exports`): functions must carry `@operation`; classes must be `BaseModel` subclasses defined in `schemas.py` or `DomainError` subclasses in `errors.py`; anything else fails | what an operation does with its access policy | none |
| Role doors are imported only by their callers | import-linter `protected` (`role_door`): `router.py` by `app.api`; `system.py` by its module, `app.api` and `app.workflows`; `jobs.py` by its module and `app.worker` | none | none, never baselinable |
| Every route is authenticated | reflection over the app's routes, included routers too (`routes_authenticated`): each depends on a `require_*` dependency or is listed public; an empty route list fails | resource checks inside the operation (a behaviour test per operation) | `public_routes` in the policy (today `/healthz`, `/readyz`) |
| One transaction owner | AST (`transaction_owner`): `.commit()`, `.rollback()`, `.begin()` only in `app/db`, `in_transaction(` only in `app/api`, `router.py`, `app/workflows`, `jobs.py`; AST (`sessions_in_db`): `sqlalchemy.ext.asyncio` imported only in `app/db`; the nesting test | `COMMIT` in raw SQL text | none, never baselinable |
| No external call inside a transaction | AST (`external_call_in_transaction`): calls inside an `async with in_transaction()` body to names imported from `app.clients` or `httpx`, or to parameters annotated with such a name; helpers are not followed | calls through helper functions, raw sockets | none |
| `rules.py` is pure | import-linter `forbidden` with indirect imports (`rules_pure_imports`): none of `[rules].forbidden` (`app.db`, `app.clients`, `app.config`, SQLAlchemy, FastAPI, Starlette, httpx, psycopg, Procrastinate); AST (`pure_rules`): no `os`, `random`, `time`, `now()`, `utcnow()`, `today()`, `uuid1()`, `uuid4()`, `open()` | impure code in a package not on the list | a package removed from `[rules].forbidden`, with a policy-log entry |
| `service`, `repository` and `rules` import no web framework | import-linter `forbidden` with indirect imports (`no_framework_in_core`) | none | none, never baselinable |
| No blocking call in async code | ruff `ASYNC`, which knows a list of blocking APIs (`blocking_call`) | arbitrary blocking or CPU-heavy code in called libraries | counted suppression comments |
| Only `config/` reads the environment | ruff TID251 bans `os.environ` and `os.getenv` (`env_reads`) | env access through third-party libraries | none, never baselinable |
| One owner per table | reflection over `Base.metadata` (`table_owners`): every table has one declared owner and is defined only in that module's `models.py`; a plain `Table` belongs to `db` | raw SQL touching another module's table: `text(` call sites are listed by `make arch` | none: a read across modules goes through the owner's door |
| One charge per payment request | the worked-slice tests (`tests/integration/test_slice.py`) | providers without idempotency support | none |
| Mounted secret files win over env | settings test with conflicting values (`tests/unit/test_settings.py`) | none | none |
| Expand migrations are additive | AST over each revision (`migration_phases`): every file sets `PHASE`; an `expand` upgrade calls no `op.drop_*` or `op.rename_table`, renames no column, tightens no column to `NOT NULL`, changes no type; a `contract` file sets `LAST_USE_REMOVED_IN` | raw SQL (`op.execute()`, `exec_driver_sql()`): allowed only with a `# reviewed: <reason>` comment on the line above, listed by `make arch` | marked raw SQL |
| Suppressions only shrink | `scripts/quality/suppressions.py`, compared with the merge base: lint suppression comments and type ignores per file and code (comment tokens only), ruff per-file-ignores entries, `.gitleaksignore` lines; a file new since the merge base is adopted; a git error fails closed | none | policy-log entries |
| Baselines only shrink, policy never loosens silently | `scripts/quality/baseline_shrinks.py` (a baseline line added since the merge base) and `scripts/quality/policy_changes.py` (a new public route, composition root, layer edge or role-door importer; a removed forbidden import or module; a raised lint threshold, removed rule family, new exclude, disabled strict mode or new deptry ignore), both failing closed | none | policy-log entries |
| No secrets committed | gitleaks 8.30.1 on staged changes (pre-commit hook) and over the full history (`make secrets-scan` in `make check`), each proven by a planted key built at run time (`tests/tooling/test_gitleaks.py`); ruff S105 to S107 | secrets in runtime output beyond the redaction list | `.gitleaksignore` fingerprints, counted |
| Declared secrets match `Settings` | the `SecretStr` fields of `Settings` equal `tools/common/secrets/secrets env-names`, and `.env.example` lists every setting by name without a value (`tests/architecture/test_secrets.py`) | none | none |
| Readiness means schema compatibility | `/readyz` checks a database ping and `REQUIRED_REVISION` in `schema_history`; tests cover old-ready after an expand migration, new-not-ready before its migration, new-ready after it, and no database (`tests/integration/test_readiness.py`) | none | none |

`template/architecture.toml` declares the layers, modules, tables, role doors, forbidden imports
and public routes; `template/.importlinter` and `architecture.schema.json` are generated from it,
and a test fails when they disagree.

**Tool choice.** import-linter 2.16 is the only import-graph enforcer. It cannot name a submodule
of an external package (`sqlalchemy.ext.asyncio`), so "sessions only in `app/db`" is an AST rule.
PyTestArch is not used: it reads the same imports, so it would be a second policy and a second
baseline for no new rule. tach is not used: it is pre-1.0 and has no baseline. The rules
import-linter cannot express are plain pytest tests in `template/tests/architecture/`, using
reflection and the AST.

## 10. Tooling

- **Lint and format:** ruff (format, line length 100). Every rule family is listed in
  `pyproject.toml` with a one-line reason; no `ALL`, no preview rules. Not selected: `ANN` (mypy
  covers it), `D`, `ERA`, `TRY`, `EM`, `FBT`, the full `PL` set.
- **Types:** mypy strict with the pydantic plugin, over `src`, `tests`, `scripts` and `alembic`.
  pyrefly may replace it once it runs clean on the template, reports every finding of the mypy
  fixtures and handles `Mapped[]` and pydantic models without suppressions; ty once it has a
  stable release, by the same test. Never two blocking type checkers.
- **Dependencies:** deptry over `src` and `alembic`; `psycopg` (the SQLAlchemy driver) and
  `uvicorn` (the server) are ignored as used by name, each with its reason.
- **Hooks:** prek reads `.pre-commit-config.yaml` (pre-commit 4 reads the same file). Pre-commit
  runs ruff, gitleaks on staged changes and `uv lock --check`; pre-push runs
  `make lint typecheck arch`.
- **Policy, baselines and the policy log.** `architecture.toml` carries `schema_version = 1`, an
  integer for the file format, independent of the blueprint release; the loader refuses an
  unknown version. `quality/arch-baseline.toml` holds a brownfield's import violations and may
  only shrink. Every accepted loosening (a suppression, a baseline line, a policy change) is an
  entry in `quality/policy-log.toml` with the exact change text the check printed, a reason and a
  date.
- **Make contract.** The Makefile includes `tools/common/make/common.mk` and `secrets.mk` and
  defines the standard targets, each a thin wrapper over `uv run`; CI calls the same targets.
  `make help` lists them. `check` runs everything CI runs: lint (with deptry and the suppression
  ratchet), typecheck, unit, integration and tooling tests, `arch` (generated files, contracts,
  architecture tests, baselines, policy changes, the review list), the secret scan and
  `alembic check`. GNU's standard targets define `check` as "perform self-tests", hence the name.

## 11. Secrets

The workflow is common 1.0.0, vendored as `tools/common/`: keyless first, naming
`<repo>-<purpose>-<env>`, `secrets.manifest.json`, pinned versions in `secret-versions/`, the
secrets CLI and `make secret-*`, the Terraform module and the agent rules. Read
`tools/common/README.md`. The Python side:

1. **A keyless database.** Production connects through the Cloud SQL Auth Proxy with
   `--auto-iam-authn`, so the URL carries no password; local and test databases use the compose
   password. The engine factory (`db/engine.py`), the job queue and Alembic share one URL.
2. **No secrets locally by default.** Every client has `fixture` and `noop` providers; `fixture`
   is the default outside production. `make dev-real` (human-run) is the only way to start with
   real `dev` values.
3. **Settings.** `settings_customise_sources` returns `(init, file secrets, env)`, so a file
   mounted under `/run/secrets` wins over an environment variable, the reverse of
   pydantic-settings' default; there is no dotenv source. Field names carry no prefix
   (`payments_api_key: SecretStr` reads `PAYMENTS_API_KEY`), and `extra="forbid"`.
   `.get_secret_value()` is called only inside the client that uses the value. Production refuses
   fixture and noop providers, and the worker builds its provider at startup, so a missing key
   stops it there.
4. **Drift.** The `SecretStr` fields equal `secrets env-names`; `.env.example` lists every
   setting by name, without values.
5. **Output.** A structlog processor masks values under keys matching
   `password|secret|token|api_key|authorization|cookie` and every `SecretStr`
   (`config/logging.py`, tested with a planted value). Free text in a message is not inspected.
   gitleaks 8.30.1 scans staged changes and the full history.
6. **Agents.** `.claude/settings.json` carries common's deny rules and sandbox, and `AGENTS.md`
   the same rules in tool-neutral words; a test checks every common rule is present. These guard
   against accidents; the boundary is that agents hold no credentials and real values are used
   only where an agent cannot steer.

## 12. Running it

Build once and promote one image; the Dockerfile follows uv's Docker guide (a pinned uv image, a
dependency layer from `uv sync --locked --no-install-project --no-editable`, bytecode compiled, no
dev dependencies, a non-root user). One uvicorn process per container, exec-form `CMD`,
`--proxy-headers`, no gunicorn. The worker is its own service with CPU always allocated, never in
the web process. Logs are structlog JSON with `request_id`, and `trace_id` and `span_id` inside a
traced request; OpenTelemetry is on only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Probes are
left out of tracing and access logs.

## 13. Greenfield and brownfield

**Greenfield:** copy `template/` into a new repository, run `make setup` and `make check`, then
replace `orders` and `billing` with your modules (`AGENTS.md`, "Where new code goes").

**Brownfield:** declare today's modules, tables and role doors in `architecture.toml`, run
`make arch-generate`, then `make arch-baseline-write`. It records today's import violations in
`quality/arch-baseline.toml` and refuses violations of never-baselinable contracts, which must be
fixed first. From then on the baseline may only shrink.

**A flat `src/` house rule** (`src/modules`, `src/db`, ...): the policy's `root_package` names the
package the contracts are generated for. The architecture tests name `app` in a few places
(`tests/architecture/`, where the AST rules look under `src/app/`) that change with it.

**Windows:** use WSL, or run the `uv run` commands from the Makefile directly.

## 14. Decision log

- **Owner decisions (2026-11-07).** One package `src/app/`; Python 3.14 or later; the policy in
  `architecture.toml` generating the import-linter config, with a drift test, and baselines as
  `ignore_imports` lines that only shrink. Procrastinate, psycopg 3, domain exceptions, mypy
  strict, async SQLAlchemy 2, operations as plain functions taking `tx` and `principal`, real
  Postgres in tests.
- **Transaction ownership:** one owner per atomic use case, the entry point (section 6).
- **Deferring inside the SQLAlchemy transaction:** Procrastinate 3.10 accepts an external
  connection, so jobs are written on the session's own connection (build spike, 2026-11-07,
  `docs/worked-slice.md`). The sweeper stays as the safety net for jobs that failed for good.
- **The slice's retry rules:** one idempotency key per request row, transient errors and unknown
  outcomes retried with it, a decline final, `needs_attention` after five attempts.
- **Readiness by compatibility,** not the exact head (section 8).
- **import-linter as the only graph enforcer,** with pytest for the rest (section 9).
- **The type-checker criteria** (section 10).
- **prek** for hooks; one runner across stacks is decided with the Next.js Makefile follow-up.
- **The Makefile contract** from common, so every blueprint has the same entry points.
- **The secrets trust boundary:** agents hold no credentials (section 11).
- **The layout deviation:** `src/app/` instead of a flat `src/` (section 2).
- **The Cloud SQL Auth Proxy instead of the Python connector:** the connector's psycopg support is
  synchronous only, and the async engine and the queue pool need async psycopg connections.
- **gitleaks 8.30.1** as the secret scanner. Its README says it is feature complete and receives
  security patches only; betterleaks replaces it in a minor release once betterleaks 2 is stable.
- **Principles copied, not shared:** section 2 repeats the Next.js 1.1.0 wording; a later change
  moves it to a root `PRINCIPLES.md`.

## 15. Add later, not now

Each comes back once a real app needs it: rename handling for baselines, a Mermaid diagram from
the policy, a module generator, vulture, a duplication gate, read exceptions for one file and one
table, API-level idempotency keys on `POST`, events between modules, tracing in the worker, PEP 810
lazy imports, Python 3.15.

## 16. Versions

This document and the template are blueprint release 1.0.0
([`template/CHANGELOG.md`](./template/CHANGELOG.md)). `architecture.toml` has its own
`schema_version`. Tool versions are pinned in `uv.lock`, the Dockerfile and the CI workflow.
