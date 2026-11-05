import { payments, prices } from "../billing/billing.tables";
import { sql } from "drizzle-orm";
export const writes = (db) => [db.insert(payments), db.delete(prices), db.execute(sql`delete from payments`)];
