import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const paymentStatus = pgEnum("payment_status", [
  "requires_payment",
  "succeeded",
  "cancelled",
  "refund_pending",
]);

export const prices = pgTable("prices", {
  productId: text("product_id").primaryKey(),
  unitCents: integer("unit_cents").notNull(),
});

// One payment attempt per order. order_id is a plain column, not a foreign key: a foreign key
// would make billing import the orders table, and only the owner may do that.
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().unique(),
  userId: text("user_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: paymentStatus("status").notNull().default("requires_payment"),
  providerRef: text("provider_ref"),
  clientSecret: text("client_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
