import { settleFromWebhook } from "@/modules/billing/server";
export async function POST() {
  await settleFromWebhook("x");
  return new Response(null);
}
