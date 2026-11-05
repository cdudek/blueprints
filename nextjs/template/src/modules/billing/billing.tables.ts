import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// requires_payment -> succeeded            the provider confirmed the money
// requires_payment -> cancel_pending       the order was cancelled; the job cancels the intent
// cancel_pending   -> cancelled            the provider confirmed the cancel
// succeeded | cancel_pending | cancelled -> refund_pending   money arrived for a cancelled order
// refund_pending   -> refunded             the job refunded it
export const paymentStatus = pgEnum("payment_status", [
  "requires_payment",
  "succeeded",
  "cancel_pending",
  "cancelled",
  "refund_pending",
  "refunded",
]);

export const prices = pgTable("prices", {
  productId: text("product_id").primaryKey(),
  unitCents: integer("unit_cents").notNull(),
});

// One payment attempt per order. order_id references orders(id): that foreign key lives in a
// reviewed custom migration (drizzle/0001_payments_order_fk.sql), because a cross-module
// constraint belongs to neither module's table file.
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().unique(),
  userId: text("user_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: paymentStatus("status").notNull().default("requires_payment"),
  providerRef: text("provider_ref"),
  clientSecret: text("client_secret"),
  // failed job attempts; the job leaves the row for the next run
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Provider events that matched no payment attempt. Stored before the webhook is acknowledged,
// so a reconciler can look at them instead of the provider's retry window expiring.
export const paymentInbox = pgTable("payment_inbox", {
  eventId: text("event_id").primaryKey(),
  attemptId: text("attempt_id").notNull(),
  type: text("type").notNull(),
  body: text("body").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
