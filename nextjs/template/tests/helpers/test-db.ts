import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { DbClient } from "@/db";
import { schema } from "@/db/schema";

export type TestDb = {
  db: DbClient;
  /** "pglite" in-process, or "postgres" when TEST_DATABASE_URL is set (CI). */
  kind: "pglite" | "postgres";
  close: () => Promise<void>;
};

const migrationsFolder = "./drizzle";

/**
 * A migrated, isolated database for one test file. PGlite needs nothing installed; with
 * TEST_DATABASE_URL each file gets its own database in the real Postgres (drizzle qualifies enum types with
 * `public`, so a schema per file would collide), dropped on close.
 */
export async function createTestDb(): Promise<TestDb> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const client = new PGlite();
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder });
    return { db, kind: "pglite", close: () => client.close() };
  }

  const name = `t_${randomBytes(6).toString("hex")}`;
  const admin = postgres(url, { max: 1 });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const own = new URL(url);
  own.pathname = `/${name}`;
  const client = postgres(own.toString(), { max: 4 });
  const db = drizzlePostgres(client, { schema });
  await migratePostgres(db, { migrationsFolder });
  return {
    db,
    kind: "postgres",
    close: async () => {
      await client.end();
      await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
