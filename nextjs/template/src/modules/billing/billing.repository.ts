import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, type DbClient } from "@/db";
import { paymentInbox, payments, prices } from "./billing.tables";
import type { NewPayment, Payment, PaymentStatus, Price } from "./billing.types";

const MAX_TRANSITION_TRIES = 5;

export const billingRepository = {
  async findPrice(productId: string, c: DbClient = db): Promise<Price | null> {
    const [row] = await c.select().from(prices).where(eq(prices.productId, productId)).limit(1);
    return row ?? null;
  },

  async findPaymentById(id: string, c: DbClient = db): Promise<Payment | null> {
    const [row] = await c.select().from(payments).where(eq(payments.id, id)).limit(1);
    return row ?? null;
  },

  async findPaymentByOrder(orderId: string, c: DbClient = db): Promise<Payment | null> {
    const [row] = await c.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
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

  // The first writer of each field wins: a webhook may link the provider reference before the
  // start-payment call stores the client secret, or the other way round.
  async attachIntent(
    id: string,
    providerRef: string,
    clientSecret: string | null,
    c: DbClient = db,
  ) {
    await c
      .update(payments)
      .set({
        providerRef: sql`coalesce(${payments.providerRef}, ${providerRef})`,
        clientSecret: sql`coalesce(${payments.clientSecret}, ${clientSecret})`,
      })
      .where(eq(payments.id, id));
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

  /**
   * Applies a state change computed from the CURRENT status. A conditional update that loses
   * (another writer moved the row first) is not success: reload, recompute, try again, until
   * the row is already where the rule wants it. Returns the row as it ends up.
   */
  async applyTransition(
    id: string,
    compute: (current: PaymentStatus) => PaymentStatus,
    c: DbClient = db,
  ): Promise<Payment | null> {
    for (let tries = 0; tries < MAX_TRANSITION_TRIES; tries++) {
      const row = await billingRepository.findPaymentById(id, c);
      if (!row) return null;
      const next = compute(row.status);
      if (next === row.status) return row;
      if (await billingRepository.transition(id, row.status, next, c))
        return { ...row, status: next };
    }
    throw new Error(
      `payment ${id} kept changing under us; giving up after ${MAX_TRANSITION_TRIES} tries`,
    );
  },

  /**
   * Gives up an attempt that never got a provider reference. One statement checks the state, the
   * missing reference and the deadline, so a webhook that linked or captured the payment after
   * the job read it wins, and a refund that became necessary is kept.
   */
  async abandonUnlinked(id: string, createdBefore: Date, c: DbClient = db): Promise<boolean> {
    const changed = await c
      .update(payments)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(payments.id, id),
          eq(payments.status, "cancel_pending"),
          isNull(payments.providerRef),
          lt(payments.createdAt, createdBefore),
        ),
      )
      .returning({ id: payments.id });
    return changed.length === 1;
  },

  listWithWork(limit: number, c: DbClient = db): Promise<Payment[]> {
    return c
      .select()
      .from(payments)
      .where(inArray(payments.status, ["cancel_pending", "refund_pending"]))
      .orderBy(payments.createdAt)
      .limit(limit);
  },

  async recordFailedAttempt(id: string, c: DbClient = db) {
    await c
      .update(payments)
      .set({ attempts: sql`${payments.attempts} + 1` })
      .where(eq(payments.id, id));
  },

  async storeInboxEvent(event: typeof paymentInbox.$inferInsert, c: DbClient = db) {
    await c
      .insert(paymentInbox)
      .values(event)
      .onConflictDoNothing({ target: paymentInbox.eventId });
  },

  listInbox(c: DbClient = db) {
    return c.select().from(paymentInbox);
  },
};
