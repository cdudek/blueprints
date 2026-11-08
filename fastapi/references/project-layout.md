---
name: fastapi-project-layout
description: Flat Python source layout, module doors and a pure domain package
read-when: laying out a Python service, adding a module or choosing where code belongs
skip-when: changing behavior within an existing boundary without moving code
---

# Project layout

Apply core [structure](../../core/references/structure.md) and [naming](../../core/references/naming.md). Python packages make their doors conventional; import checks make those doors real.

## Rules

- **FPY-1 Package the flat source roots explicitly.** Install the product so imports resolve from `src/`, including in tests and containers. Do not make `src` an import prefix or patch `sys.path` in tests. Declare first-party roots to the build backend, Ruff, dependency checks and import-linter. Check for collisions with installed packages because names such as `config` are generic.
- **FPY-2 A module's `__init__.py` is its ordinary door.** List exports by name with relative imports and `__all__`. Export operations, input/output records and closed error types. Keep models, repositories and helpers private. The door contains no declarations, aliases or wildcard imports; `modules/__init__.py` stays empty. `__all__` alone does not prevent deep imports (STR-2).
- **FPY-3 Add role doors only when needed.** `router.py` is mounted only by `api/`; `jobs.py` is registered only by the worker and may be used within its owning module for deferral. `system.py` exposes job and verified-webhook operations only to declared delivery callers and workflows. It grants no authority by its name: retain STR-6 and STR-7 access checks. Never re-export privileged operations through the ordinary door.
- **FPY-4 `domain/` is a pure leaf.** Put a shared business value or decision here only once several modules need it. It imports no modules, config, database, client or web framework, and performs no I/O, clock reads or randomness. Module-specific decisions remain in `rules.py`; generic plumbing remains in `shared/` (STR-5, STR-18).
- **FPY-5 Pass dependencies as Python arguments.** FastAPI `Depends` and request objects stop at the HTTP edge. Services receive a principal and typed inputs; repositories receive the operation's transaction. A client uses a `Protocol` and a factory, described in [clients](clients.md). There is no dependency-injection container or database port to invent.

## How to apply

This is an annotated product tree, not files to copy:

```text
src/
  main.py                 composition root and FastAPI lifespan
  worker.py               worker composition root and task registration
  api/                    auth dependencies, mounting, errors, middleware, probes
    workflows/            named cross-module processes; no transaction of their own
  domain/                 shared business values and decisions; no I/O
  modules/
    orders/
      __init__.py         ordinary door: named exports and __all__ only
      service.py          operations and their transaction boundaries
      repository.py       private SQLAlchemy queries; takes tx
      rules.py            pure order decisions
      schemas.py          Pydantic inputs and plain output records
      models.py           private SQLAlchemy mappings
      errors.py           closed operation error codes
      router.py           optional HTTP door
    billing/              same inside; optional system.py and jobs.py
  clients/payments/       base.py, factory.py, providers/; see clients reference
  config/                 Settings, logging and telemetry setup
  db/                     engine, transaction gateway, metadata and queue adapter
  shared/                 generic result, principal and access types; no I/O
alembic/                  migration environment and immutable revisions
tests/                    unit, integration, contract and architecture layers
architecture.yaml         core ARCH-1 policy, extended for Python roots and role doors
```

New product: install the roots, declare the first module and its doors, then build checks before wiring a route. Inside a module, use relative imports rather than importing its own door. On adoption, map existing packages to the policy and move one capability at a time; do not create a second source layout alongside it.

## Checks

Automatic: an installed-package smoke test imports every declared root outside the checkout; import-linter and AST checks enforce FPY-2 to FPY-5, including transitive purity. See [architecture checks](architecture-checks.md) for their limits. Review: whether a shared business concept belongs in `domain/` and whether a module expresses one capability.

## Mistakes to avoid

- Putting the entire service under a new `src/app/` wrapper while checks scan the flat layout.
- A door that re-exports a SQLAlchemy model or a worker-only operation.
- Moving business logic into a router to make an import contract pass.
