import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { payments } from "@/modules/billing/billing.tables";
import { db } from "@/shared/db";
import { signInAs } from "@tests/helpers/auth-mock";
import { resetData } from "@tests/helpers/db-mock";
import { cancelOrder, listMyOrders, markPaidFromWebhook, placeOrder } from "./order.service";
import { orders } from "./order.tables";

vi.mock("@/shared/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));
vi.mock("@/shared/auth", () => import("@tests/helpers/auth-mock").then((m) => m.authMock));

const C1 = "00000000-0000-4000-8000-000000000001";
const order = (checkoutId = C1, quantity = 2) => ({ checkoutId, productId: "widget", quantity });
const allPayments = () => db.select().from(payments);
const statusOf = async (id: string) =>
  (await db.select().from(orders).where(eq(orders.id, id)))[0]?.status;

beforeEach(async () => {
  await resetData(db);
  signInAs("u1");
});

describe("placeOrder", () => {
  it("creates a pending order and one payment", async () => {
    const result = await placeOrder(order());
    expect(result.ok && result.value.payment?.clientSecret).toBeTruthy();
    expect(await listMyOrders()).toHaveLength(1);
    expect(await allPayments()).toHaveLength(1);
  });

  it("is safe under a double submit: one order, one payment", async () => {
    const results = await Promise.all([
      placeOrder(order()),
      placeOrder(order()),
      placeOrder(order()),
    ]);
    const ids = new Set(results.map((r) => (r.ok ? r.value.orderId : null)));
    expect(ids.size).toBe(1);
    expect(await allPayments()).toHaveLength(1);
  });

  it("returns a conflict when a retry changes product or quantity", async () => {
    await placeOrder(order(C1, 2));
    expect(await placeOrder(order(C1, 5))).toEqual({
      ok: false,
      error: "this checkout was already used for a different order",
    });
  });

  it("never resolves another user's checkout id to their order", async () => {
    const mine = await placeOrder(order());
    signInAs("u2");
    const theirs = await placeOrder(order());
    expect(mine.ok && theirs.ok && mine.value.orderId !== theirs.value.orderId).toBe(true);
    expect(await listMyOrders()).toHaveLength(1);
  });

  it("refuses an unknown product", async () => {
    expect(await placeOrder({ ...order(), productId: "nope" })).toEqual({
      ok: false,
      error: "unknown product",
    });
  });

  it("starts no payment when a cancelled checkout is replayed", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    await cancelOrder(placed.value.orderId);
    const replay = await placeOrder(order());
    expect(replay).toEqual({ ok: false, error: "this checkout was cancelled" });
    expect(await allPayments()).toHaveLength(1);
  });

  it("starts no second payment when a paid checkout is retried", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    await markPaidFromWebhook(placed.value.orderId);
    const retry = await placeOrder(order());
    expect(retry.ok && retry.value.payment).toBeNull();
    expect(await allPayments()).toHaveLength(1);
  });

  it("requires a signed-in user", async () => {
    signInAs(null);
    await expect(placeOrder(order())).rejects.toThrow("not signed in");
  });
});

describe("cancelOrder", () => {
  it("cancels the order and the open payment in one transaction", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    expect(await cancelOrder(placed.value.orderId)).toEqual({ ok: true, value: true });
    expect(await statusOf(placed.value.orderId)).toBe("cancelled");
    expect((await allPayments())[0]?.status).toBe("cancelled");
  });

  it("answers not found for another user's order", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    signInAs("u2");
    expect(await cancelOrder(placed.value.orderId)).toEqual({ ok: false, error: "not found" });
  });

  it("refuses a second cancel", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    await cancelOrder(placed.value.orderId);
    const again = await cancelOrder(placed.value.orderId);
    expect(again.ok).toBe(false);
  });

  it("cancelling a paid order records a refund, never paid-and-cancelled without one", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    await db.update(payments).set({ status: "succeeded" });
    await markPaidFromWebhook(placed.value.orderId);
    expect(await cancelOrder(placed.value.orderId)).toEqual({ ok: true, value: true });
    expect(await statusOf(placed.value.orderId)).toBe("cancelled");
    expect((await allPayments())[0]?.status).toBe("refund_pending");
  });
});

describe("markPaidFromWebhook", () => {
  it("moves a pending order to paid once", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    await markPaidFromWebhook(placed.value.orderId);
    await markPaidFromWebhook(placed.value.orderId);
    expect(await statusOf(placed.value.orderId)).toBe("paid");
  });

  it("records a refund when payment succeeded after a cancel", async () => {
    const placed = await placeOrder(order());
    if (!placed.ok) throw new Error("setup failed");
    await db.update(orders).set({ status: "cancelled" });
    await db.update(payments).set({ status: "succeeded" });
    await markPaidFromWebhook(placed.value.orderId);
    expect(await statusOf(placed.value.orderId)).toBe("cancelled");
    expect((await allPayments())[0]?.status).toBe("refund_pending");
  });
});
