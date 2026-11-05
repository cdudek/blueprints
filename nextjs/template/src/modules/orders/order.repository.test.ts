import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/shared/db";
import { resetData } from "@tests/helpers/db-mock";
import { orderRepository as repo } from "./order.repository";
import { orders } from "./order.tables";

vi.mock("@/shared/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));

const base = { productId: "widget", quantity: 1, totalCents: 1250 };
const checkout = (userId: string, checkoutId: string) => ({ ...base, userId, checkoutId });
const A = "00000000-0000-4000-8000-00000000000a";

beforeEach(() => resetData(db));

describe("findOrCreateByCheckout", () => {
  it("returns the same order for concurrent submits of one checkout", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.findOrCreateByCheckout(checkout("u1", A))),
    );
    expect(new Set(results.map((o) => o.id)).size).toBe(1);
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("keeps one user's checkout id from resolving to another user's order", async () => {
    const first = await repo.findOrCreateByCheckout(checkout("u1", A));
    const second = await repo.findOrCreateByCheckout(checkout("u2", A));
    expect(second.id).not.toBe(first.id);
    expect(second.userId).toBe("u2");
  });
});

describe("conditional updates", () => {
  it("cancels once; a second cancel changes nothing", async () => {
    const order = await repo.findOrCreateByCheckout(checkout("u1", A));
    const cutoff = new Date(Date.now() - 60_000);
    expect(await repo.cancelIfUnchanged(order.id, "u1", "pending", cutoff)).toBe(true);
    expect(await repo.cancelIfUnchanged(order.id, "u1", "pending", cutoff)).toBe(false);
  });

  it("refuses to cancel an order that changed since it was read", async () => {
    const order = await repo.findOrCreateByCheckout(checkout("u1", A));
    await repo.transition(order.id, "pending", "paid");
    const cutoff = new Date(Date.now() - 60_000);
    expect(await repo.cancelIfUnchanged(order.id, "u1", "pending", cutoff)).toBe(false);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row?.status).toBe("paid");
  });

  it("refuses to cancel once the window has closed at write time", async () => {
    const order = await repo.findOrCreateByCheckout(checkout("u1", A));
    const futureCutoff = new Date(Date.now() + 60_000);
    expect(await repo.cancelIfUnchanged(order.id, "u1", "pending", futureCutoff)).toBe(false);
  });

  it("does not cancel another user's order", async () => {
    const order = await repo.findOrCreateByCheckout(checkout("u1", A));
    expect(await repo.cancelIfUnchanged(order.id, "u2", "pending", new Date(0))).toBe(false);
  });
});
