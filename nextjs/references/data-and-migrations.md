---
name: nextjs-data-and-migrations
description: Drizzle or Prisma ownership, typed transaction plumbing and migration delivery in Next.js
read-when: adding a table or query, changing a schema, wiring database access or planning a deployment
skip-when: changing a UI with no data contract change
---

# Data and migrations

Apply [core data and migrations](../../core/references/data-and-migrations.md) and [compatibility](../../core/references/compatibility.md). Postgres is concrete infrastructure; TypeScript interfaces are for variable external providers, not an imaginary replacement database.

## Rules

- **NEXT-DATA-1 Use one ORM and one server-only database gateway.** Drizzle is the default; Prisma is the alternative. `src/db/` owns the client, pooling and transaction types. Module repositories own queries. Pages, route handlers and components never import the database or generated ORM client. Use the Node runtime for the chosen driver unless a measured requirement and tested adapter justify another runtime.
- **NEXT-DATA-2 Schema composition does not transfer ownership.** With Drizzle, table definitions stay in module `*.tables.ts` files; `db/schema.ts` only composes them. Migration generation reads the same set. With Prisma, record each model's owner in `architecture.yaml`, including auth models, and keep generated client access behind that owner's repository. Cross-module foreign keys remain database constraints, reviewed by both owners; avoid circular TypeScript imports by expressing the constraint in a reviewed migration when needed.
- **NEXT-DATA-3 Carry a real transaction type.** A service that must participate in its caller's transaction requires `Tx`, not an optional database client that can silently escape to the global connection. A repository may accept the regular client for an independent read, but uses the transaction supplied by an atomic operation. Rollback must cover typed failure paths too; returning an error value from a transaction callback must not commit half a change.
- **NEXT-DATA-4 Migration files and metadata are one history.** Generate and review the SQL plus ORM journal or metadata together. Never renumber applied migrations or hand-edit the journal to make a deploy pass. Verify the target database identity from non-secret metadata and check the resulting schema, rather than trusting a silent migration command. Development schema push is not the production deployment procedure.
- **NEXT-DATA-5 Deploy with expand, migrate, contract.** Run pending reviewed migrations once, under the migrator role, before shifting traffic; web instances never migrate at boot. Test the old and new application against the expanded schema while both revisions can serve. Backfills are resumable and observable; contraction waits until old code, workers and payloads are gone. See core for preflights and irreversible changes.
- **NEXT-DATA-6 Pooling and cache scope follow the deployment.** Cap per-instance pools against Cloud SQL capacity and the maximum instance count. Reuse the driver client safely during local reloads without creating an implicit global session. User-specific reads are not placed in shared Next.js caches; revalidation occurs only after a successful committed mutation and targets the affected resource.

## How to apply

Declare the table owners, compose the first schema and generate the first migration before the first page reads data. Add integration tests using a real Postgres with the same migration path as production. Exercise missing rows, constraint failures and lost conditional updates through service operations.

Changing later: expand first, deploy compatible code, backfill with progress and refusal checks, then contract separately. Investigate a migration mismatch as a history or target problem, never by deleting the journal or replacing migrations with an unreviewed push.

## Checks

- Automatic: schema ownership and database import guards; real Postgres repository tests; applying migrations from empty and representative prior schemas; a second migration run is a no-op; runtime credentials cannot perform DDL.
- Automatic: concurrent state changes prove the affected row count is checked; a failed atomic step leaves no partial write. Build and e2e verify cache invalidation after mutation.
- Review: generated SQL and metadata agree, `Tx` reaches each query, lock duration and pool capacity are safe, old revisions remain compatible.

## Mistakes to avoid

- An ORM upgrade bundled with a schema rewrite and new driver.
- Calling a provider while holding a database transaction open.
- Treating a fresh seeded database as proof that a production upgrade is safe.
