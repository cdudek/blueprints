"use server";

import { revalidatePath } from "next/cache";
import { orderIdSchema, placeOrderSchema } from "@/modules/orders/public";
import type { CancelOrderResponse, PlaceOrderResponse } from "@/modules/orders/public";
import { currentSession } from "@/modules/accounts/server";
import { cancelOrder, placeOrder } from "@/modules/orders/server";

// Thin: safeParse, read the session, call one operation, revalidate, return a small DTO.
export async function placeOrderAction(
  _previous: PlaceOrderResponse | null,
  form: FormData,
): Promise<PlaceOrderResponse> {
  const parsed = placeOrderSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const session = await currentSession();
  if (!session.ok) return { ok: false, error: session.error };
  const result = await placeOrder(session.value, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/orders");
  return { ok: true, orderId: result.value.orderId, clientSecret: result.value.clientSecret };
}

export async function cancelOrderAction(id: unknown): Promise<CancelOrderResponse> {
  const parsed = orderIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const session = await currentSession();
  const result = session.ok ? await cancelOrder(session.value, parsed.data) : session;
  if (result.ok) revalidatePath("/orders");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
