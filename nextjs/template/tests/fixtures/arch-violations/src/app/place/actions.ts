"use server";
import { placeOrder } from "@/modules/orders/server";

export async function placeAction() {
  return placeOrder();
}
