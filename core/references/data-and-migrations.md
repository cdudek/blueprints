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
- **DAT-20 A migration that can refuse data ships a read-only preflight.** Adding a unique index, a not-null, a foreign key, a check constraint or a narrower type can fail on real rows that a fresh dev database never has. The preflight runs read-only against production and reports offending rows. A test asserts the specific refusal.
- **DAT-21 Verify the result, not the exit code.** The pipeline confirms the expected migrations are applied.
- **DAT-22 Readiness checks compatibility, not the latest migration.** An older revision runs against a newer schema during a rollout and must stay ready.
- **DAT-25 Squawk checks every new or changed migration in the local gate.** Use the Postgres migration linter [Squawk](https://squawkhq.com/) (pin and credit in [sources](sources.md)), with its default rules enabled and the production Postgres major and migration runner's transaction behaviour configured. Findings fail the gate: an index without `CONCURRENTLY`, a new `NOT NULL` column without a default on an existing table, a type change that rewrites a table, and the other defaults. An exception uses a statement-scoped inline `squawk-ignore` naming the rule, with an adjacent comment explaining why it is safe; a companion check rejects missing reasons and blanket or global exclusions. An ignore does not waive DAT-26 or DAT-27.
- **DAT-26 A guard enforces expand/contract against the released version.** A migration may not drop or rename a table, column or enum value that the currently released version still reads or writes. Parse the migration's destructive operations, including enum replacement sequences, and compare their targets with a schema-dependency manifest derived from the released artifact's code and SQL references. Take the immutable released revision from deployment evidence, not the PR head or default branch; include every revision still serving or retained as a rollback target. Unknown references, dynamic SQL the manifest cannot resolve, missing release evidence or parse failures fail closed. For a first release, require explicit evidence that no release exists. Deploy the version that no longer uses the object first; contract in a later PR once protected revisions no longer need it. A contract marker or a review approval alone cannot bypass the guard.
- **DAT-27 The gate requires and executes preflight proof.** Classify new or changed migration SQL for a unique index, `NOT NULL`, foreign key, check constraint or narrower type, including later constraint validation. Each such operation maps by migration id to a read-only preflight (DAT-20) and an executable refusal test. Missing preflight, missing test or an unclassified operation fails the gate. On real Postgres, seed rows that violate that exact condition, assert that the preflight reports them and the migration refuses for the expected constraint or type reason, then assert clean rows pass. Enforce read-only execution with database permissions and a read-only transaction. Run pending preflights against production with a separate read-only identity before migration; offenders or inability to read fail rather than skip. Production access may be a separate cloud gate (see [ci](ci.md) CI-36); the local gate always checks coverage and runs the refusal tests without production access.
- **DAT-28 The local gate migrates from zero and checks drift.** It starts a fresh disposable real Postgres matching the production major and required extensions, applies every committed migration in order using the production migration runner, verifies the expected applied set (DAT-21), then compares the resulting database schema with the schema definition. Compare normalized tables, columns, types, indexes and constraints, excluding only declared engine/tool metadata. A mismatch, unapplied migration, unavailable database or skipped suite fails. A developer's existing database, generated snapshot or successful exit code is no substitute.

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
7. Wire the separate local `migrate` step (see [ci](ci.md) CI-42): Squawk, released-version compatibility guard, preflight coverage and refusal tests, migration from zero and drift comparison. Map migration paths and schema definition files at Migrate in `boundary-map.yaml` (STR-26).

Changing a schema later:

1. Edit the table definition, generate the migration, read the SQL.
2. Run the released-version compatibility guard (DAT-26); split incompatible work into expand, deploy and a later contract PR (see [compatibility](compatibility.md)).
3. If the migration can refuse rows, write the preflight and its refusal test first; the coverage guard checks this (DAT-27).
4. Run the local gate, including `migrate`, before pushing (CI-35).
5. Before migration, the production preflight must pass. The pipeline backs up, runs the separate migrate job, then rolls out.

## Checks

Automatic:

- Repositories are the only importers of the ORM and table definitions.
- The required local gate's `migrate` step runs Squawk on every added or changed migration against the target branch's merge base, plus staged, unstaged and untracked migration files during local development. Handle paths safely, report the files checked, and fail on unavailable base refs or diff errors; only a proven empty file set may report no changes (DAT-25).
- The released-version dependency guard rejects destructive operations still used by protected releases, even with a contract marker or Squawk ignore (DAT-26).
- SQL classification requires the matching read-only preflight and refusal test; both offending and clean fixtures execute on real Postgres (DAT-27).
- The gate itself creates disposable Postgres, applies all migrations from zero, verifies the applied set and compares the live schema with the definition (DAT-28).
- Applied migration files are unchanged compared with the target branch (hash or diff check).
- The push command is blocked for agents and absent from scripts and docs.
- Concurrency tests use real separate connections on Postgres.
- A PR touching a migration lists it in the PR output; migration and schema definition paths have at least the Migrate floor in `boundary-map.yaml` (STR-26).

Review: index impact on large tables and expected lock duration, alongside Squawk; estimates need production table size, traffic and query patterns. Expand/contract safety and preflight coverage are automatic requirements above.

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
