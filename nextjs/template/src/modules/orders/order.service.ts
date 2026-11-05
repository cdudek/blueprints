import "server-only";
import {
  startPayment,
  priceFor,
  recordCancellation,
  recordCancellationFromWebhook,
} from "@/modules/billing/server";
import { requireUser } from "@/shared/auth";
import { db } from "@/shared/db";
import { err, ok } from "@/shared/result";
import { orderRepository as repo } from "./order.repository";
import { cancelCutoff, canCancel, sameCheckout, totalCents } from "./order.rules";
import type { PlaceOrderInput } from "./order.schema";

class RolledBack extends Error {}

export async function placeOrder(input: PlaceOrderInput) {
  const user = await requireUser();
  const price = await priceFor(input.productId);
  if (!price.ok) return price;

  const order = await repo.findOrCreateByCheckout({
    userId: user.id,
    checkoutId: input.checkoutId,
    productId: input.productId,
    quantity: input.quantity,
    totalCents: totalCents(price.value.unitCents, input.quantity),
  });

  if (!sameCheckout(order, input))
    return err("this checkout was already used for a different order");
  if (order.status === "cancelled") return err("this checkout was cancelled");
  if (order.status !== "pending") return ok({ orderId: order.id, payment: null });

  // billing persists one payment attempt per order and reuses it on retry
  const payment = await startPayment(order.id, order.totalCents);
  if (!payment.ok) return payment;
  return ok({ orderId: order.id, payment: payment.value });
}

export async function cancelOrder(id: string) {
  const user = await requireUser();
  const order = await repo.findForUser(id, user.id);
  if (!order) return err("not found");

  const now = new Date();
  const check = canCancel(order, now);
  if (!check.ok) return check;

  // The transaction passes `tx` to billing for a database-only write. No external call in here:
  // billing's job cancels the open payment or refunds a captured one after commit.
  try {
    const cancelled = await db.transaction(async (tx) => {
      const changed = await repo.cancelIfUnchanged(
        id,
        user.id,
        order.status,
        cancelCutoff(now),
        tx,
      );
      if (!changed) return false;
      const recorded = await recordCancellation(order.id, tx);
      // a failed billing write must roll the order back too
      if (!recorded.ok) throw new RolledBack(recorded.error);
      return true;
    });
    return cancelled ? ok(true) : err("order changed, reload and try again");
  } catch (e) {
    if (e instanceof RolledBack) return err(e.message);
    throw e;
  }
}

// Webhook only: no user, reachable solely from the signature-verified payments route.
export async function markPaidFromWebhook(orderId: string) {
  if (await repo.transition(orderId, "pending", "paid")) return;
  const order = await repo.findById(orderId);
  // late payment success after a cancel: make sure billing refunds it
  if (order?.status === "cancelled") await recordCancellationFromWebhook(orderId);
}

export async function listMyOrders() {
  const user = await requireUser();
  return repo.listForUser(user.id);
}
