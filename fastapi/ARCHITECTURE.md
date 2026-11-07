---
title: FastAPI application architecture blueprint
status: draft
version: 1.0.0
audience: engineers and agents building or changing a FastAPI service
stack: FastAPI, Python 3.14, Postgres (async SQLAlchemy 2, psycopg 3, Alembic), Procrastinate, pydantic
template: ./template (runnable, carries every rule below as code)
---

# FastAPI application architecture blueprint

> Draft. Section 9 is written first, from the checks that exist; the other sections are written
> on the finished example (release step 11), and no sentence may promise more than its row here.

## 9. Guarantees and the coverage matrix

Each row states what a tool detects, what stays review, and which exceptions are allowed. Every
detected row has a deliberate-violation fixture under `template/tests/fixtures/arch/<rule>/`, a
clean twin that must pass, and an assertion on the exact message. A green run means "no detected
violation outside the listed exceptions", not "correct".

Never admitted to a baseline: role-door protection, environment reads, framework imports in
`service`, `repository` or `rules`, and transaction ownership.

A stated limit: import-linter baselines are per module pair, so a second violation of a pair in
the same file is invisible once the pair is baselined.

| Guarantee | Detected by | Not detected (review) | Allowed exceptions |
| --- | --- | --- | --- |
| Dependencies point one way: roots, `api`, `workflows`, modules (billing over orders), infrastructure | import-linter `layers` contract (`layers`) | `importlib` and string imports | brownfield baseline pairs |
| Other modules enter only through the door | import-linter `protected` contract per module over every file but the doors, every import form, direct imports (`door`); a test fails when a module file is in no contract | `importlib` and string imports | brownfield baseline pairs |
| A door holds only imports from its own module and `__all__`; `modules/__init__.py` stays empty | AST (`door_shape`): no star imports, no aliases, no declarations, no re-export of another module | none | none |
| A door exports only operations, schemas and errors | reflection (`door_exports`): functions must carry `@operation`; classes must be `BaseModel` subclasses defined in `schemas.py` or `DomainError` subclasses in `errors.py`; anything else fails | what an operation does with its access policy | none |
| Role doors are imported only by their callers | import-linter `protected` (`role_door`): `router.py` by `app.api`; `system.py` by its module, `app.api` and `app.workflows`; `jobs.py` by its module and `app.worker` | none | none, never baselinable |
| Every route is authenticated | reflection over the app's routes, included routers too (`routes_authenticated`): each depends on a `require_*` dependency or is listed public; an empty route list fails | resource checks inside the operation (a behaviour test per operation) | public allowlist (today `/healthz`, `/readyz`) |
| One transaction owner | AST (`transaction_owner`): `.commit()`, `.rollback()`, `.begin()` only in `app/db`, `in_transaction(` only in `app/api`, `router.py`, `app/workflows`, `jobs.py`; AST (`sessions_in_db`): `sqlalchemy.ext.asyncio` imported only in `app/db`; the nesting test | `COMMIT` in raw SQL text | none, never baselinable |
| No external call inside a transaction | AST (`external_call_in_transaction`): calls inside an `async with in_transaction()` body to names imported from `app.clients` or `httpx`, or to parameters annotated with such a name; helpers are not followed | calls through helper functions, raw sockets | none |
| `rules.py` is pure | import-linter `forbidden` with indirect imports (`rules_pure_imports`): no `app.db`, `app.clients`, `app.config`, SQLAlchemy, FastAPI, Starlette, httpx, psycopg, Procrastinate; AST (`pure_rules`): no `os`, `random`, `time`, `now()`, `utcnow()`, `today()`, `uuid1()`, `uuid4()`, `open()` | impure code in an allowed package | packages listed in the policy |
| `service`, `repository` and `rules` import no web framework | import-linter `forbidden` with indirect imports (`no_framework_in_core`) | none | none, never baselinable |
| No blocking call in async code | ruff `ASYNC`, which knows a list of blocking APIs (`blocking_call`) | arbitrary blocking or CPU-heavy code in called libraries | counted `noqa` lines |
| Only `config/` reads the environment | ruff TID251 bans `os.environ` and `os.getenv` (`env_reads`) | env access through third-party libraries | none, never baselinable |
| One owner per table | reflection over `Base.metadata` (`table_owners`): every table has one declared owner and is defined only in that module's `models.py`; a plain `Table` belongs to `db` | raw SQL touching another module's table: `text(` call sites are listed by `make arch` | read exceptions in the policy |
| One charge per payment request | the worked-slice tests (`tests/integration/test_slice.py`) | providers without idempotency support | none |
| Mounted secret files win over env | settings test with conflicting values (`tests/unit/test_settings.py`) | none | none |
| Expand migrations are additive | AST over each revision (`migration_phases`): every file sets `PHASE`; an `expand` upgrade calls no `op.drop_*` or `op.rename_table`, renames no column, tightens no column to `NOT NULL`, changes no type; a `contract` file sets `LAST_USE_REMOVED_IN` | raw SQL (`op.execute()`, `exec_driver_sql()`): allowed only with a `# reviewed: <reason>` comment on the line above, listed by `make arch` | marked raw SQL |
| Suppressions only shrink | `scripts/quality/suppressions.py`, compared with the merge base: lint suppression comments and type ignores per file and code (comment tokens only), ruff per-file-ignores entries, `.gitleaksignore` lines; a file new since the merge base is adopted; a git error fails closed | none | policy-log entries (build step 10; until then every increase fails) |
| Baselines only shrink, policy never loosens silently | arrives with `baseline_shrinks.py` and `policy_changes.py` (build step 10) | none | policy-log entries |
| No secrets committed | gitleaks 8.30.1 on staged changes (pre-commit hook) and over the full history (`make secrets-scan` in `make check`), each proven by a planted key built at run time (`tests/tooling/test_gitleaks.py`); ruff S105 to S107 | secrets in runtime output beyond the redaction list | `.gitleaksignore` fingerprints, counted |
| Declared secrets match `Settings` | the `SecretStr` fields of `Settings` equal `tools/common/secrets/secrets env-names`, and `.env.example` lists every setting by name without a value (`tests/architecture/test_secrets.py`) | none | none |
| Readiness means schema compatibility | `/readyz` checks a database ping and `REQUIRED_REVISION` in `schema_history`; tests cover old-ready after an expand migration, new-not-ready before its migration, new-ready after it, and no database (`tests/integration/test_readiness.py`) | none | none |

Until the policy file exists (build step 10), the declared table owners and the public routes are
written in `template/tests/architecture/test_reflection_rules.py`, and the contracts in
`template/.importlinter` are hand-written.

**Tool choice.** import-linter is the only import-graph enforcer. It cannot name a submodule of an
external package (`sqlalchemy.ext.asyncio`), so "sessions only in `app/db`" is an AST rule. The
rules import-linter cannot express are plain pytest tests in `template/tests/architecture/`, using
reflection and the AST.
