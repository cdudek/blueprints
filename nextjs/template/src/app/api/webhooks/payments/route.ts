/**
 * Workflow: payment webhook (billing records the event, then orders marks the order paid)
 * Owner: this route sequences the two modules so they never call each other.
 *
 * @workflow payment-webhook
 * retry-safe: yes. A provider retry re-runs both steps; each one is idempotent and state-based.
 * duplicates: no duplicate effect. A repeated event re-applies a transition that already happened.
 * recovery: if orders fails after billing recorded the event, we answer 500; the provider
 *   retries and billing reports the same succeeded state, so orders runs again.
 * survives-restart: yes. All state is in the database; nothing is held in memory.
 */
import { receivePaymentEventFromWebhook } from "@/modules/billing/server";
import { markPaidFromWebhook } from "@/modules/orders/server";

export async function POST(req: Request) {
  const signature = req.headers.get("x-payments-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const received = await receivePaymentEventFromWebhook(await req.text(), signature);
  if (!received.ok) return new Response(received.error, { status: 400 });

  if (received.value?.status === "succeeded") await markPaidFromWebhook(received.value.orderId);
  return new Response(null, { status: 200 });
}
