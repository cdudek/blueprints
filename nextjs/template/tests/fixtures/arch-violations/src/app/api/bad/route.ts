import { placeOrder } from "@/modules/orders/server";
import { chargeFn } from "@/modules/billing/server";
export async function POST() {
  await placeOrder();
  await chargeFn();
  return new Response(null);
}
