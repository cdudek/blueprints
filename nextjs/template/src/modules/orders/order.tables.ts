import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// Status is a database enum, not a free string.
export const orderStatus = pgEnum("order_status", ["pending", "paid", "cancelled", "shipped"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    // Persisted checkout identity: one user's checkout id can never resolve to another user's order.
    checkoutId: text("checkout_id").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    totalCents: integer("total_cents").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("orders_user_checkout_unique").on(t.userId, t.checkoutId)],
);
