import { describe, expect, it } from "vitest";
import { canCancel, cancelCutoff, sameCheckout, totalCents } from "./order.rules";

const now = new Date("2026-01-02T12:00:00Z");
const fresh = new Date("2026-01-02T11:00:00Z");
const stale = new Date("2026-01-01T11:00:00Z");

describe("canCancel", () => {
  it("allows pending and paid orders inside the window", () => {
    expect(canCancel({ status: "pending", createdAt: fresh }, now).ok).toBe(true);
    expect(canCancel({ status: "paid", createdAt: fresh }, now).ok).toBe(true);
  });
  it("refuses shipped and cancelled orders", () => {
    expect(canCancel({ status: "shipped", createdAt: fresh }, now)).toEqual({
      ok: false,
      error: "not_cancellable",
    });
    expect(canCancel({ status: "cancelled", createdAt: fresh }, now).ok).toBe(false);
  });
  it("refuses once the window has closed", () => {
    expect(canCancel({ status: "pending", createdAt: stale }, now)).toEqual({
      ok: false,
      error: "window_closed",
    });
  });
});

describe("cancelCutoff", () => {
  it("is exactly 24 hours before now", () => {
    expect(cancelCutoff(now).toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });
});

describe("sameCheckout", () => {
  it("matches only when product and quantity are unchanged", () => {
    const order = { productId: "p1", quantity: 2 };
    expect(sameCheckout(order, { productId: "p1", quantity: 2 })).toBe(true);
    expect(sameCheckout(order, { productId: "p1", quantity: 3 })).toBe(false);
    expect(sameCheckout(order, { productId: "p2", quantity: 2 })).toBe(false);
  });
});

describe("totalCents", () => {
  it("multiplies unit price by quantity", () => {
    expect(totalCents(250, 4)).toBe(1000);
  });
});
