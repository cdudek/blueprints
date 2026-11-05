import "server-only";
import { payments as paymentsClient, InvalidSignatureError } from "@/clients/payments";
import { requireUser } from "@/shared/auth";
import { db, type DbClient } from "@/shared/db";
import { err, ok } from "@/shared/result";
import { afterCancellation, afterProviderEvent } from "./billing.rules";
import { billingRepository as repo } from "./billing.repository";
import type { PaymentEventOutcome, PaymentStart } from "./billing.types";

export async function priceFor(productId: string) {
  await requireUser();
  const price = await repo.findPrice(productId);
  return price ? ok({ unitCents: price.unitCents }) : err("unknown product");
}

// Persists one payment attempt per order and reuses it on retry. The provider call happens
// here, outside any database transaction, with the attempt id as idempotency key.
export async function startPayment(orderId: string, amountCents: number) {
  const user = await requireUser();
  const payment = await repo.findOrCreatePayment({ orderId, userId: user.id, amountCents });
  if (payment.userId !== user.id) return err("not allowed");

  if (payment.providerRef && payment.clientSecret) {
    return ok<PaymentStart>({ paymentId: payment.id, clientSecret: payment.clientSecret });
  }
  const intent = await paymentsClient().createIntent({
    amountCents: payment.amountCents,
    idempotencyKey: payment.id,
  });
  await repo.attachIntent(payment.id, intent.providerRef, intent.clientSecret);
  const stored = await repo.findPaymentByOrder(orderId);
  return ok<PaymentStart>({
    paymentId: payment.id,
    clientSecret: stored?.clientSecret ?? intent.clientSecret,
  });
}

// Database write only, idempotent per order. A billing job (add it when you need one) then
// cancels an open intent or refunds a captured payment. `tx` comes from the calling service.
export async function recordCancellation(orderId: string, tx: DbClient = db) {
  const user = await requireUser();
  const payment = await repo.findPaymentByOrder(orderId, tx);
  if (payment && payment.userId !== user.id) return err("not allowed");
  await applyCancellation(orderId, tx);
  return ok(true);
}

// Webhook only: the same write for a late payment success, no user.
export async function recordCancellationFromWebhook(orderId: string) {
  await applyCancellation(orderId, db);
}

export async function receivePaymentEventFromWebhook(rawBody: string, signature: string) {
  let event;
  try {
    event = paymentsClient().parseEvent(rawBody, signature);
  } catch (e) {
    if (e instanceof InvalidSignatureError) return err("invalid signature");
    throw e;
  }

  const payment = await repo.findPaymentByProviderRef(event.providerRef);
  if (!payment) return ok<PaymentEventOutcome | null>(null);

  const next = afterProviderEvent(payment.status, event.type);
  if (next !== payment.status) await repo.transition(payment.id, payment.status, next);
  const current = (await repo.findPaymentByProviderRef(event.providerRef)) ?? payment;
  return ok<PaymentEventOutcome | null>({ orderId: current.orderId, status: current.status });
}

async function applyCancellation(orderId: string, c: DbClient) {
  const payment = await repo.findPaymentByOrder(orderId, c);
  if (!payment) return;
  const next = afterCancellation(payment.status);
  if (next !== payment.status) await repo.transition(payment.id, payment.status, next, c);
}
