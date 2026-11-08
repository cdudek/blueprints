---
name: fastapi-database-and-migrations
description: Async SQLAlchemy, explicit transactions, Alembic and compatible schema rollout
read-when: adding a model or repository, changing transactions, migrations or schema readiness
skip-when: the change touches no database behavior
---

# Database and migrations

Apply core [data and migrations](../../core/references/data-and-migrations.md), [structure](../../core/references/structure.md) STR-11 to STR-15 and [compatibility](../../core/references/compatibility.md). SQLAlchemy and Alembic are the Python choices for those rules.

## Rules

- **FDB-1 Use one async engine factory with psycopg.** Web, worker, migrations and tests use it with their own process settings. Configure pool limits and pre-ping, dispose on shutdown and budget all replicas and queue pools together (DAT-5). An `AsyncSession` belongs to one transaction in one task, never to concurrent tasks. Read [SQLAlchemy asyncio](https://docs.sqlalchemy.org/en/latest/orm/extensions/asyncio.html) for session and implicit-I/O restrictions.
- **FDB-2 Models stay in the owning module.** Use typed `Mapped` fields and one declarative metadata registry with deterministic constraint names. A dedicated metadata composition root imports each module's models for Alembic; ordinary consumers may not. Cross-module foreign keys use table names, not ORM relationships that load another module's private records. Return materialized records before the session closes; prevent lazy loads during response serialization.
- **FDB-3 The service gateway opens the unit transaction.** A small `db/transaction.py` context manager yields a typed transaction handle; repositories accept it explicitly and only query or flush. Commit on successful operation completion and roll back on unexpected exceptions or an error result. Returning a typed error must not accidentally commit earlier writes. Reject nested unit transactions; a narrowly scoped adapter savepoint for a duplicate enqueue is a separate, tested mechanism. Routers and workflows do not become transaction owners (FAPI-1).
- **FDB-4 Alembic uses the same settings, engine and registered metadata.** In `env.py`, bridge the async connection through `run_sync` for Alembic's synchronous migration context. Enable type comparison and explicitly exclude only queue-owned objects managed by their own reviewed migrations. Autogeneration is a draft to review, not an authority. Compare the migrated schema with metadata to catch drift; do not bootstrap tests with `create_all`.
- **FDB-5 Mark each revision's rollout phase.** An `expand` revision adds compatible structure; a `contract` revision records the release that removed the last use and the completed rollback window. An AST gate catches known destructive Alembic operations in expand revisions, including drops, renames, type changes and nullability tightening. List raw SQL for review with a reason at the call site; static syntax cannot prove it additive. DAT-15 to DAT-21 still govern immutability, preflights and release execution.
- **FDB-6 Track readiness requirements separately from exact heads.** A small `schema_history` table can record applied revisions through Alembic's `on_version_apply` hook in the migration transaction; remove a revision entry if an approved downgrade removes it. Each build names the revisions or capabilities it requires. Readiness asks whether these requirements hold; the deployment separately verifies the intended Alembic heads. Presence in history is not a promise of compatibility after a destructive contract, so the release process must retire incompatible builds before contraction.

## How to apply

```text
service operation:
  begin unit transaction
  repository conditional update -> check changed row
  write durable intent in the same transaction
  success -> commit; error result or exception -> rollback

release A: expand -> verify heads -> roll out compatible consumers
release B: backfill -> verify -> remove old readers and writers
release C: after rollback window -> contract
```

New product: create the base, engine, transaction gateway and metadata root, then its first Alembic revision. See the [Alembic cookbook](https://alembic.sqlalchemy.org/en/latest/cookbook.html) for the async bridge; do not substitute its optional fresh-schema shortcuts for migration tests. On adoption, inventory existing revision history and required capabilities before enabling schema readiness. A change that adds a table also declares its owner and updates the build's requirements when code starts using it.

## Checks

Automatic: migrate an empty disposable Postgres, re-run safely, compare metadata, reject edits to applied revisions, and run preflight/refusal cases on representative data. Test rollback after both an exception and a typed error result, nested-unit refusal and conditional-update races on independent connections. Test history updates atomically with migration failure and old/new readiness across expansion. Review: SQL lock duration, enum evolution, raw SQL ownership, migration role permissions and the contract release's compatibility evidence.

## Mistakes to avoid

- Treating ORM objects with lazy relationships as response DTOs.
- Returning an error from a transaction context that commits on every normal return.
- Making readiness require the latest head and taking old instances down during an additive rollout.
