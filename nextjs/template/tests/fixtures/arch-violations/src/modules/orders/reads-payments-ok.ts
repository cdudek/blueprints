import { payments } from "../billing/billing.tables";
export const rows = (db) => db.select().from(payments);
