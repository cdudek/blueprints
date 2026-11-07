// Used as: vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()))
// The module under test then talks to a real, migrated test database (PGlite, or Postgres in CI).
import { afterAll } from "vitest";
import { sql } from "drizzle-orm";
import type { DbClient, Tx } from "@/db";
import { createTestDb } from "./test-db";

export async function dbModule() {
  const test = await createTestDb();
  afterAll(() => test.close());
  return {
    db: test.db,
    /** Test-only: this file's database URL (Postgres only), for a client that is not drizzle. */
    testUrl: test.url,
    inTransaction: <R>(fn: (tx: Tx) => Promise<R>) =>
      test.db.transaction((tx) => fn(tx as unknown as Tx)),
  };
}

/** Clears the data tables between tests; the seeded price catalog stays. */
export async function resetData(db: DbClient) {
  await db.execute(sql`TRUNCATE TABLE orders, payments, payment_inbox CASCADE`);
}
