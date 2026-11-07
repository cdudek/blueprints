// The payment provider's webhook: checks that a signature is present and calls one workflow
// (app/_workflows/payment-event.ts), which verifies it and sequences billing and orders.
import { settlePaymentEvent } from "@/app/_workflows/payment-event";

export async function POST(req: Request) {
  const signature = req.headers.get("x-payments-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const settled = await settlePaymentEvent(await req.text(), signature);
  if (!settled.ok) return new Response(settled.error, { status: 400 });
  return new Response(null, { status: 200 });
}
