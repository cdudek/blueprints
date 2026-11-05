import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "./env";

// postgres-js connects on the first query, so importing this file opens nothing.
// No schema is passed: modules query their own tables, this file knows none of them.
export const db = drizzle(postgres(getEnv().DATABASE_URL));

// Accepts the pool, a transaction, and the PGlite test database alike.
export type DbClient = PgDatabase<PgQueryResultHKT>;
