import "server-only";
import {
  priceFor,
  recordCancellation,
  recordCancellationFromWebhook,
  startPayment,
} from "@/modules/billing/server";
import { inTransaction } from "@/db";
import { operation } from "@/shared/access";
import { err, ok, type Result } from "@/shared/result";
import { orderRepository as repo } from "./order.repository";
import { cancelCutoff, canCancel, sameCheckout, totalCents } from "./order.rules";
import type { PlaceOrderInput } from "./order.schema";
import type { Order, PlaceOrderError, PlaceOrderSuccess } from "./order.types";

class RolledBack extends Error {
  constructor(readonly code: "forbidden" | "unauthenticated") {
    super(code);
  }
}

export const placeOrder = operation(
  {
    access: "user",
    resource: "the caller's own checkout: orders are keyed by (user, checkout id)",
  },
  async (user, input: PlaceOrderInput): Promise<Result<PlaceOrderSuccess, PlaceOrderError>> => {
    // A retry resolves the existing checkout FIRST and resumes with the terms it persisted:
    // today's catalog must not change what the customer already agreed to.
    let order: Order | null = await repo.findByCheckout(user.id, input.checkoutId);

    if (!order) {
      const price = await priceFor(input.productId);
      if (!price.ok) return price;
      order = await repo.findOrCreateByCheckout({
        userId: user.id,
        checkoutId: input.checkoutId,
        productId: input.productId,
        quantity: input.quantity,
        totalCents: totalCents(price.value.unitCents, input.quantity),
      });
    }

    if (!sameCheckout(order, input)) return err("checkout_conflict");
    if (order.status === "cancelled") return err("checkout_cancelled");
    if (order.status !== "pending") return ok({ orderId: order.id, clientSecret: null });

    // billing persists one payment attempt per order and reuses it on retry
    const payment = await startPayment({
      orderId: order.id,
      userId: user.id,
      amountCents: order.totalCents,
    });
    if (!payment.ok) return payment;
    return ok({ orderId: order.id, clientSecret: payment.value.clientSecret });
  },
);

export const cancelOrder = operation(
  { access: "user", resource: "an order the caller owns (findForUser)" },
  async (user, id: string) => {
    const order = await repo.findForUser(id, user.id);
    if (!order) return err("not_found");

    const now = new Date();
    const check = canCancel(order, now);
    if (!check.ok) return check;

    // `tx` goes to billing for a database-only write. No external call in here: billing's job
    // cancels the open payment or refunds a captured one after commit. A failed billing write
    // throws, which rolls the order change back too.
    try {
      const cancelled = await inTransaction(async (tx) => {
        const changed = await repo.cancelIfUnchanged(
          id,
          user.id,
          order.status,
          cancelCutoff(now),
          tx,
        );
        if (!changed) return false;
        const recorded = await recordCancellation(order.id, tx);
        if (!recorded.ok) throw new RolledBack(recorded.error);
        return true;
      });
      return cancelled ? ok(true) : err("changed");
    } catch (e) {
      if (e instanceof RolledBack) return err(e.code);
      throw e;
    }
  },
);

// System operation: reachable only from the payments route, after billing verified the event.
export const markPaidFromWebhook = operation(
  {
    access: "webhook",
    verifiedBy: "the payments route, after receivePaymentEventFromWebhook verified the event",
  },
  async (orderId: string) => {
    if (await repo.transition(orderId, "pending", "paid")) return ok(true);
    const order = await repo.findById(orderId);
    // late payment success after a cancel: make sure billing refunds it
    if (order?.status === "cancelled") await recordCancellationFromWebhook(orderId);
    return ok(true);
  },
);

export const listMyOrders = operation(
  { access: "user", resource: "the caller's own orders" },
  async (user) => ok(await repo.listForUser(user.id)),
);
