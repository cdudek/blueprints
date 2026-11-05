"use server";

import { revalidatePath } from "next/cache";
import { orderIdSchema, placeOrderSchema } from "@/modules/orders/public";
import type { CancelOrderResponse, PlaceOrderResponse } from "@/modules/orders/public";
import { cancelOrder, placeOrder } from "@/modules/orders/server";

// Thin: safeParse, call a service, revalidate, return a small DTO. No logic, no database.
export async function placeOrderAction(
  _previous: PlaceOrderResponse | null,
  form: FormData,
): Promise<PlaceOrderResponse> {
  const parsed = placeOrderSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const result = await placeOrder(parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/orders");
  return { ok: true, orderId: result.value.orderId, clientSecret: result.value.clientSecret };
}

export async function cancelOrderAction(id: unknown): Promise<CancelOrderResponse> {
  const parsed = orderIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const result = await cancelOrder(parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/orders");
  return { ok: true };
}
