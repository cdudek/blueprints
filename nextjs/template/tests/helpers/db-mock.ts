// Used as: vi.mock("@/shared/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()))
// The module under test then talks to a real, migrated test database (PGlite, or Postgres in CI).
import { afterAll } from "vitest";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { createTestDb } from "./test-db";

export async function dbModule() {
  const test = await createTestDb();
  afterAll(() => test.close());
  return { db: test.db };
}

/** Clears the data tables between tests; the seeded price catalog stays. */
export async function resetData(db: PgDatabase<PgQueryResultHKT>) {
  await db.execute(sql`TRUNCATE TABLE orders, payments`);
}
