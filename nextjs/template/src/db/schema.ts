// The persistence composition root. This is the one place allowed to import every module's
// table files (and only table files): it assembles the schema so drizzle's relational queries
// work and the foreign keys between modules can be expressed. Nothing else may import it
// except ./index.ts. drizzle-kit reads the same table files through drizzle.config.ts.
import * as billing from "@/modules/billing/billing.tables";
import * as orders from "@/modules/orders/order.tables";

export const schema = { ...orders, ...billing };
