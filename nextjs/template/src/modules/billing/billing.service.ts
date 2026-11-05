import "server-only";
import { InvalidSignatureError, payments as paymentsClient } from "@/clients/payments";
import type { Tx } from "@/db";
import { operation } from "@/shared/access";
import { err, ok } from "@/shared/result";
import { billingRepository as repo } from "./billing.repository";
import {
  afterCancelAttempt,
  afterCancellation,
  afterProviderEvent,
  canAbandonUnlinked,
} from "./billing.rules";
import { attemptIdSchema, productIdSchema } from "./billing.schema";
import type {
  AuthorizedOrder,
  PaymentEventOutcome,
  PaymentStart,
  PaymentWorkSummary,
} from "./billing.types";

const MAX_JOB_BATCH = 25;

export const priceFor = operation(
  {
    access: "public",
    validation: "productIdSchema (non-empty string)",
    abuseControls: "read-only catalog lookup; rate-limit it at the edge",
  },
  async (productId: string) => {
    if (!productIdSchema.safeParse(productId).success) return err("invalid_product");
    const price = await repo.findPrice(productId);
    return price ? ok({ unitCents: price.unitCents }) : err("unknown_product");
  },
);

// Persists one payment attempt per order and reuses it on retry. The provider call happens
// here, outside any database transaction, with the attempt id as idempotency key.
export const startPayment = operation(
  { access: "user", resource: "the payment attempt of an order the caller owns (AuthorizedOrder)" },
  async (user, order: AuthorizedOrder) => {
    if (order.userId !== user.id) return err("forbidden");
    const payment = await repo.findOrCreatePayment({
      orderId: order.orderId,
      userId: order.userId,
      amountCents: order.amountCents,
    });
    if (payment.userId !== user.id) return err("forbidden");
    // once a cancel was requested the attempt must never get a fresh intent
    if (payment.status !== "requires_payment") return err("not_payable");

    if (payment.providerRef && payment.clientSecret) {
      return ok<PaymentStart>({ paymentId: payment.id, clientSecret: payment.clientSecret });
    }
    const intent = await paymentsClient().createIntent({
      amountCents: payment.amountCents,
      attemptId: payment.id,
      idempotencyKey: payment.id,
    });
    await repo.attachIntent(payment.id, intent.providerRef, intent.clientSecret);
    const stored = await repo.findPaymentById(payment.id);
    return ok<PaymentStart>({
      paymentId: payment.id,
      clientSecret: stored?.clientSecret ?? intent.clientSecret,
    });
  },
);

// Database write only, idempotent per order, and only ever inside the caller's transaction:
// it takes a Tx, so it cannot be called without one. The cancel/refund job does the provider work.
export const recordCancellation = operation(
  { access: "user", resource: "the payment of an order the caller owns" },
  async (user, orderId: string, tx: Tx) => {
    const payment = await repo.findPaymentByOrder(orderId, tx);
    if (!payment) return ok(false);
    if (payment.userId !== user.id) return err("forbidden");
    await repo.applyTransition(payment.id, afterCancellation, tx);
    return ok(true);
  },
);

// System operation: the same write for a late payment success, with no signed-in user.
export const recordCancellationFromWebhook = operation(
  {
    access: "webhook",
    verifiedBy: "the payments route, after receivePaymentEventFromWebhook verified the event",
  },
  async (orderId: string) => {
    const payment = await repo.findPaymentByOrder(orderId);
    if (payment) await repo.applyTransition(payment.id, afterCancellation);
    return ok(true);
  },
);

export const receivePaymentEventFromWebhook = operation(
  {
    access: "webhook",
    verifiedBy: "the payments port verifies the signature against the raw body",
  },
  async (rawBody: string, signature: string) => {
    let event;
    try {
      event = paymentsClient().parseEvent(rawBody, signature);
    } catch (e) {
      if (e instanceof InvalidSignatureError) return err("invalid_signature");
      throw e;
    }

    // correlate by OUR attempt id: it exists before the provider call, so an event that beats
    // our own bookkeeping (success before attachIntent) still finds its payment
    const payment = attemptIdSchema.safeParse(event.attemptId).success
      ? await repo.findPaymentById(event.attemptId)
      : null;
    if (!payment) {
      // durable intent before acknowledging: keep what we could not match
      await repo.storeInboxEvent({
        eventId: event.id,
        attemptId: event.attemptId,
        type: event.type,
        body: rawBody,
      });
      return ok<PaymentEventOutcome | null>(null);
    }
    await repo.attachIntent(payment.id, event.providerRef, null);
    const current = await repo.applyTransition(payment.id, (s) =>
      afterProviderEvent(s, event.type),
    );
    return ok<PaymentEventOutcome | null>(
      current && { orderId: current.orderId, status: current.status },
    );
  },
);

// Drains cancel and refund work with the provider, with retries: a failure leaves the row for
// the next run. Triggered by the cron route.
export const processPaymentWorkFromJob = operation(
  { access: "job", triggeredBy: "app/api/cron/payments/route.ts, authenticated with CRON_SECRET" },
  async (now: Date) => {
    const summary: PaymentWorkSummary = { processed: 0, failed: 0 };
    for (const payment of await repo.listWithWork(MAX_JOB_BATCH)) {
      try {
        if (payment.status === "cancel_pending") {
          if (!payment.providerRef) {
            // nothing to cancel yet: wait for the reference, or give up after the grace period
            if (canAbandonUnlinked(payment.createdAt, now))
              await repo.applyTransition(payment.id, () => "cancelled");
            continue;
          }
          const { result } = await paymentsClient().cancelIntent(payment.providerRef);
          await repo.applyTransition(payment.id, (s) =>
            s === "cancel_pending" ? afterCancelAttempt(result) : s,
          );
        } else if (payment.providerRef) {
          await paymentsClient().refund(payment.providerRef);
          await repo.applyTransition(payment.id, (s) => (s === "refund_pending" ? "refunded" : s));
        }
        summary.processed += 1;
      } catch {
        await repo.recordFailedAttempt(payment.id);
        summary.failed += 1;
      }
    }
    return ok(summary);
  },
);

export const listPaymentInboxFromJob = operation(
  { access: "job", triggeredBy: "a reconciliation job or an operator script" },
  async () => ok(await repo.listInbox()),
);
