import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, type DbClient } from "@/shared/db";
import { payments, prices } from "./billing.tables";
import type { NewPayment, Payment, PaymentStatus, Price } from "./billing.types";

export const billingRepository = {
  async findPrice(productId: string, c: DbClient = db): Promise<Price | null> {
    const [row] = await c.select().from(prices).where(eq(prices.productId, productId)).limit(1);
    return row ?? null;
  },

  async findPaymentByOrder(orderId: string, c: DbClient = db): Promise<Payment | null> {
    const [row] = await c.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    return row ?? null;
  },

  async findPaymentByProviderRef(providerRef: string, c: DbClient = db): Promise<Payment | null> {
    const [row] = await c
      .select()
      .from(payments)
      .where(eq(payments.providerRef, providerRef))
      .limit(1);
    return row ?? null;
  },

  // One attempt per order (unique order_id): a retry gets the same row back.
  async findOrCreatePayment(data: NewPayment, c: DbClient = db): Promise<Payment> {
    const [created] = await c
      .insert(payments)
      .values(data)
      .onConflictDoNothing({ target: payments.orderId })
      .returning();
    if (created) return created;
    const existing = await billingRepository.findPaymentByOrder(data.orderId, c);
    if (!existing) throw new Error("payment vanished after a conflict");
    return existing;
  },

  // Only the first writer stores the provider reference.
  async attachIntent(id: string, providerRef: string, clientSecret: string, c: DbClient = db) {
    await c
      .update(payments)
      .set({ providerRef, clientSecret })
      .where(and(eq(payments.id, id), isNull(payments.providerRef)));
  },

  // Conditional on the status the caller read, so two writers cannot both win.
  async transition(
    id: string,
    from: PaymentStatus,
    to: PaymentStatus,
    c: DbClient = db,
  ): Promise<boolean> {
    const changed = await c
      .update(payments)
      .set({ status: to })
      .where(and(eq(payments.id, id), eq(payments.status, from)))
      .returning({ id: payments.id });
    return changed.length === 1;
  },
};
