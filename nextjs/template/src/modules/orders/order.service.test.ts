import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { payments } from "@/modules/billing/billing.tables";
import { db } from "@/db";
import { prices } from "@/modules/billing/billing.tables";
import { policyOf } from "@/shared/access";
import type { Session } from "@/shared/auth";
import { sessionOf } from "@tests/helpers/session";
import { resetData } from "@tests/helpers/db-mock";
import { cancelOrder, listMyOrders, markPaidFromWebhook, placeOrder } from "./order.service";
import { orders } from "./order.tables";

vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));

const C1 = "00000000-0000-4000-8000-000000000001";
const order = (checkoutId = C1, quantity = 2) => ({ checkoutId, productId: "widget", quantity });
const myOrders = async () => {
  const r = await listMyOrders(me);
  return r.ok ? r.value : [];
};
const allPayments = () => db.select().from(payments);
const statusOf = async (id: string) =>
  (await db.select().from(orders).where(eq(orders.id, id)))[0]?.status;

let me: Session | null = sessionOf("u1");

beforeEach(async () => {
  await resetData(db);
  me = sessionOf("u1");
});

describe("placeOrder", () => {
  it("creates a pending order and one payment", async () => {
    const result = await placeOrder(me, order());
    expect(result.ok && result.value.clientSecret).toBeTruthy();
    expect(await myOrders()).toHaveLength(1);
    expect(await allPayments()).toHaveLength(1);
  });

  it("is safe under a double submit: one order, one payment", async () => {
    const results = await Promise.all([
      placeOrder(me, order()),
      placeOrder(me, order()),
      placeOrder(me, order()),
    ]);
    const ids = new Set(results.map((r) => (r.ok ? r.value.orderId : null)));
    expect(ids.size).toBe(1);
    expect(await allPayments()).toHaveLength(1);
  });

  it("returns a conflict when a retry changes product or quantity", async () => {
    await placeOrder(me, order(C1, 2));
    expect(await placeOrder(me, order(C1, 5))).toEqual({ ok: false, error: "checkout_conflict" });
  });

  it("never resolves another user's checkout id to their order", async () => {
    const mine = await placeOrder(me, order());
    me = sessionOf("u2");
    const theirs = await placeOrder(me, order());
    expect(mine.ok && theirs.ok && mine.value.orderId !== theirs.value.orderId).toBe(true);
    expect(await myOrders()).toHaveLength(1);
  });

  it("refuses an unknown product", async () => {
    expect(await placeOrder(me, { ...order(), productId: "nope" })).toEqual({
      ok: false,
      error: "unknown_product",
    });
  });

  it("starts no payment when a cancelled checkout is replayed", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    await cancelOrder(me, placed.value.orderId);
    const replay = await placeOrder(me, order());
    expect(replay).toEqual({ ok: false, error: "checkout_cancelled" });
    expect(await allPayments()).toHaveLength(1);
  });

  it("starts no second payment when a paid checkout is retried", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    await markPaidFromWebhook(placed.value.orderId);
    const retry = await placeOrder(me, order());
    expect(retry.ok && retry.value.clientSecret).toBeNull();
    expect(await allPayments()).toHaveLength(1);
  });

  it("answers a typed unauthenticated error instead of throwing", async () => {
    me = null;
    expect(await placeOrder(me, order())).toEqual({ ok: false, error: "unauthenticated" });
  });
});

describe("cancelOrder", () => {
  it("cancels the order and records the payment cancel in one transaction", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    expect(await cancelOrder(me, placed.value.orderId)).toEqual({ ok: true, value: true });
    expect(await statusOf(placed.value.orderId)).toBe("cancelled");
    expect((await allPayments())[0]?.status).toBe("cancel_pending");
  });

  it("answers not found for another user's order", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    me = sessionOf("u2");
    expect(await cancelOrder(me, placed.value.orderId)).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses a second cancel", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    await cancelOrder(me, placed.value.orderId);
    const again = await cancelOrder(me, placed.value.orderId);
    expect(again.ok).toBe(false);
  });

  it("cancelling a paid order records a refund, never paid-and-cancelled without one", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    await db.update(payments).set({ status: "succeeded" });
    await markPaidFromWebhook(placed.value.orderId);
    expect(await cancelOrder(me, placed.value.orderId)).toEqual({ ok: true, value: true });
    expect(await statusOf(placed.value.orderId)).toBe("cancelled");
    expect((await allPayments())[0]?.status).toBe("refund_pending");
  });
});

describe("markPaidFromWebhook", () => {
  it("moves a pending order to paid once", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    await markPaidFromWebhook(placed.value.orderId);
    await markPaidFromWebhook(placed.value.orderId);
    expect(await statusOf(placed.value.orderId)).toBe("paid");
  });

  it("records a refund when payment succeeded after a cancel", async () => {
    const placed = await placeOrder(me, order());
    if (!placed.ok) throw new Error("setup failed");
    await db.update(orders).set({ status: "cancelled" });
    await db.update(payments).set({ status: "succeeded" });
    await markPaidFromWebhook(placed.value.orderId);
    expect(await statusOf(placed.value.orderId)).toBe("cancelled");
    expect((await allPayments())[0]?.status).toBe("refund_pending");
  });
});

describe("retries and races", () => {
  it("resumes a checkout with its persisted terms even if the product is no longer sold", async () => {
    const first = await placeOrder(me, order());
    await db.delete(prices).where(eq(prices.productId, "widget"));
    const retry = await placeOrder(me, order());
    expect(first.ok && retry.ok && first.value.orderId === retry.value.orderId).toBe(true);
    expect(await allPayments()).toHaveLength(1);
    // restore the catalog for the other tests
    await db.insert(prices).values({ productId: "widget", unitCents: 1250 });
  });

  it("keeps the order and its payment consistent when cancel races the payment webhook", async () => {
    for (let round = 0; round < 6; round++) {
      await resetData(db);
      const placed = await placeOrder(me, order());
      if (!placed.ok) throw new Error("setup failed");
      await db.update(payments).set({ status: "succeeded" });
      await Promise.all([
        cancelOrder(me, placed.value.orderId),
        markPaidFromWebhook(placed.value.orderId),
      ]);
      const status = await statusOf(placed.value.orderId);
      const payment = (await allPayments())[0]?.status;
      // never cancelled without a refund recorded, never paid-and-refunded
      if (status === "cancelled") expect(payment).toBe("refund_pending");
      else expect(payment).toBe("succeeded");
    }
  });

  it("declares its access policies", () => {
    expect(policyOf(placeOrder)).toMatchObject({ access: "user" });
    expect(policyOf(markPaidFromWebhook)).toMatchObject({ access: "webhook" });
  });
});
