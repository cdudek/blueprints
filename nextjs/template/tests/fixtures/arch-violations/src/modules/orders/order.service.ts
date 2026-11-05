import "server-only";
import { requireUser } from "@/shared/auth";
import { chargeFn } from "@/modules/billing/server";
import { findOrder } from "./order.repository";
export async function placeOrder() {
  await requireUser();
  return chargeFn() + findOrder();
}
