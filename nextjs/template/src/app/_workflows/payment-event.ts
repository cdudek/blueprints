/**
 * Workflow: payment webhook (billing records the event, then orders marks the order paid)
 * Owner: app/, so the two modules never call each other. The webhook route calls it after the
 * provider's signature header is present; billing verifies the signature itself.
 *
 * @workflow payment-webhook
 * retry-safe: yes. A provider retry re-runs both steps; each one is idempotent and state-based.
 * duplicates: no duplicate effect. A repeated event re-applies a transition that already happened.
 * recovery: if orders fails after billing recorded the event, we answer 500; the provider
 *   retries and billing reports the same succeeded state, so orders runs again. An event that
 *   matches no payment attempt is stored in billing's inbox before we answer 200.
 * survives-restart: yes. All state is in the database; nothing is held in memory.
 */
import { receivePaymentEventFromWebhook } from "@/modules/billing/server";
import { markPaidFromWebhook } from "@/modules/orders/server";

/** Billing records the signed event; when the payment succeeded, orders marks the order paid. */
export async function settlePaymentEvent(body: string, signature: string) {
  const received = await receivePaymentEventFromWebhook(body, signature);
  // an unmatched event is already stored in billing's inbox, so acknowledging it loses nothing
  if (received.ok && received.value?.status === "succeeded")
    await markPaidFromWebhook(received.value.orderId);
  return received;
}
