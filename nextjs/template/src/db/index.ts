import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/shared/env";
import { schema } from "./schema";

// postgres-js connects on the first query, so importing this file opens nothing.
export const db = drizzle(postgres(getEnv().DATABASE_URL), { schema });

// Accepts the pool, a transaction, and the PGlite test database alike.
export type DbClient = PgDatabase<PgQueryResultHKT, typeof schema>;

declare const transactionBrand: unique symbol;
/**
 * A database client that is inside a transaction. Operations that must only ever run inside
 * their caller's transaction take a `Tx` (never an optional client), so calling one without a
 * transaction does not compile. Only `inTransaction` can make one.
 */
export type Tx = DbClient & { readonly [transactionBrand]: true };

/** The one gateway for opening a transaction. No external call belongs inside `fn`. */
export function inTransaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
  return db.transaction((tx) => fn(tx as unknown as Tx));
}
