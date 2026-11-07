---
name: data-and-migrations
description: How data is stored, accessed and changed: Postgres, ORM, repositories, transactions, migration files, rollout order, background jobs and developer databases.
read-when: adding a table or column, writing a query, changing a migration, adding a background job, or setting up a database for a developer or an environment.
skip-when: the change touches no data.
---

# Data and migrations

Postgres is the database, the ORM is the only way code talks to it, and each module's repository is the only place that uses the ORM. Schema changes are files in pull requests, applied by a separate job, never pushed by hand. The one idea: any release can be rolled back without touching the database, and no migration surprises production data.

## Rules

### Access

- **DAT-1 Postgres, through an ORM.** drizzle by default, Prisma as the alternative (record the choice, see [stack](stack.md)). No second database engine without an ADR. The database is not behind a factory, see [clients](clients.md).
- **DAT-2 One repository per module.** It issues all of the module's queries. Services never write queries. Every repository method accepts an optional client or transaction. Pass plain filter objects below the delivery layer, never request objects.
- **DAT-3 Table conventions.** UUID primary keys. Timezone-aware timestamps. `updated_at` maintained by the database. Money as integer minor units or exact decimal plus currency code (EUR). Status as an enum. Soft archive where history matters, and soft-deleted rows still count when a constraint scans the table. Append-only ledgers use compensating entries.
- **DAT-4 Tables have one owner.** See [structure](structure.md) (STR-11). Cross-module foreign keys live in a reviewed migration.
- **DAT-5 Mind the connection budget.** Replicas times pool size plus background listeners must stay under the database limit. Name the pool size in config.

### Transactions

- **DAT-6 The service operation owns the transaction.** One gateway function opens it. Repositories never commit or roll back.
- **DAT-7 No external call inside a transaction.** No HTTP, no email, no vendor SDK, no nested transaction. Record what must happen in the same transaction, do the call afterwards.
- **DAT-8 Conditional updates for state changes.** Update where the expected current state holds and check the row count. A lost update is reloaded, never reported as success.

### Background jobs

- **DAT-9 A job is enqueued in the same transaction as the write that needs it.** Use an outbox table drained by a worker, or a queue that lives in Postgres and enqueues atomically. If the write commits, the job exists. If it rolls back, the job never existed. Never enqueue after commit from code that can crash in between.
- **DAT-10 Jobs run at least once.** Every external call from a job carries an idempotency key derived from a persisted id, never from the run. A scheduled job has a stable key so the queue holds one pending copy.
- **DAT-11 Outbox rows have a lifecycle.** Claim and commit before external I/O, a lease, backoff, a terminal-failure state with a record, and a tool to redrive. Alert on exhausted work and on a missing heartbeat, even when the queue is empty.
- **DAT-12 Scheduled jobs are described.** Owner, purpose, explicit timezone, why that timing, idempotent, no overlap, bounded runtime, and how to remove it.
- **DAT-13 Run the worker in its own process.** Not inside a web process on a platform that scales or throttles CPU per request.

### Migrations

- **DAT-14 Schema changes are migration files in a PR.** Generated from the schema, reviewed, committed. Never push a schema directly to a shared database, not from a laptop, not from an agent. A hook or permission rule blocks the push command.
- **DAT-15 Applied migrations are never edited, renumbered or reordered.** Fix a mistake with a new migration. The migration tool compares by order or timestamp and will not notice an edited file.
- **DAT-16 Migrations are idempotent where the engine allows.** Use "if not exists" style guards for extensions, indexes and enum values, so a re-run after a partial failure is safe.
- **DAT-17 Migrations run as a separate job before the new revision takes traffic.** Different identity from the app: the job has DDL rights, the app has data rights only. Never at web startup, never from several instances at once.
- **DAT-18 Back up before migrating.** A fresh backup or a point-in-time marker exists before the migration job runs in production. A backup is not disaster recovery until a restore has been tested.
- **DAT-19 Expand, migrate, contract.** See [compatibility](compatibility.md).
- **DAT-20 A migration that can refuse data ships a read-only preflight.** Adding a unique index, a not-null, a foreign key or a narrower type can fail on real rows that a fresh dev database never has. The preflight runs read-only against production and reports offending rows. A test asserts the specific refusal.
- **DAT-21 Verify the result, not the exit code.** The pipeline confirms the expected migrations are applied.
- **DAT-22 Readiness checks compatibility, not the latest migration.** An older revision runs against a newer schema during a rollout and must stay ready.

### Developer databases

- **DAT-23 Every developer and every agent session has its own database.** Local container or a personal cloud database. Never a shared one and never production credentials. Tests run on a real Postgres that is disposable and explicitly reset. A green run that skipped the database suites is incomplete.
- **DAT-24 Seed and demo data are scripts outside the app source**, a declared exemption, never run in production.

## How to apply

New product:

1. Choose drizzle unless Prisma is required, create the database client file as the single gateway and the transaction helper.
2. For each module, create its table definitions and repository. Register the tables and owners in the policy file.
3. Add the first migration. If the product needs extensions, enable them in the first migration, and make sure the migration role may do so.
4. Add the migrate job target to the image (see [release-and-deploy](release-and-deploy.md)) and a separate database role for the app.
5. Add the jobs table or queue, and the worker entry point, when the first background task appears, not before.
6. Add the hook or rule that blocks direct schema push.

Changing a schema later:

1. Edit the table definition, generate the migration, read the SQL.
2. Ask whether the change breaks the running revision (see [compatibility](compatibility.md)). If it does, split it into expand and contract releases.
3. If the migration can refuse rows, write the preflight and its test first.
4. Merge. The pipeline backs up, runs the migrate job, then rolls out.

## Checks

Automatic:

- Repositories are the only importers of the ORM and table definitions.
- A test creates a database from the migrations only and compares it with the schema definition (no drift).
- Applied migration files are unchanged compared with the target branch (hash or diff check).
- The push command is blocked for agents and absent from scripts and docs.
- Concurrency tests use real separate connections on Postgres.
- A PR touching a migration lists it in the PR output.

Review: expand and contract split, preflight need, index impact on large tables, lock duration.

## Mistakes to avoid

- Pushing the schema "just for dev" and then having no migration for it.
- Editing an applied migration because it only broke staging.
- Running migrations at web startup, so every instance races.
- Calling a vendor inside a transaction, then holding row locks for seconds.
- Enqueuing a job after commit: a crash in between loses it forever.
- A migration tested only on an empty database that fails on production rows.
- Treating a backup as proof that a rollback works. Compatible schema is what makes rollback work.
- A readiness check that demands the latest migration, which takes old revisions out of service mid-rollout.
- Migration role and app role being the same, so a SQL injection can drop tables.
