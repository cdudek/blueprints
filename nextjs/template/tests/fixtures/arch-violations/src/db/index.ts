import "server-only";
import { schema } from "./schema";
export const db = { schema, transaction: async (fn) => fn() };
export const inTransaction = (fn) => db.transaction(fn);
