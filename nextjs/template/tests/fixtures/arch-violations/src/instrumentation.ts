import { placeOrder } from "@/modules/orders/server";
export async function register() {
  await placeOrder();
}
