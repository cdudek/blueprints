import { err, ok, type Result } from "@/shared/result";
import type { Order, OrderStatus } from "./order.types";

export const CANCELLABLE: readonly OrderStatus[] = ["pending", "paid"];
const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

// Time comes in as a parameter: rules never read a clock.
export function cancelCutoff(now: Date): Date {
  return new Date(now.getTime() - CANCEL_WINDOW_MS);
}

export function canCancel(order: Pick<Order, "status" | "createdAt">, now: Date): Result<true> {
  if (!CANCELLABLE.includes(order.status)) return err(`a ${order.status} order cannot be cancelled`);
  if (order.createdAt < cancelCutoff(now)) return err("cancel window closed");
  return ok(true);
}

export function sameCheckout(
  order: Pick<Order, "productId" | "quantity">,
  input: { productId: string; quantity: number },
): boolean {
  return order.productId === input.productId && order.quantity === input.quantity;
}

export function totalCents(unitCents: number, quantity: number): number {
  return unitCents * quantity;
}
