import { settlePayment } from "@/app/_workflows/settle-payment";

export async function POST() {
  await settlePayment("x");
  return new Response(null);
}
