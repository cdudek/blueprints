import { describe, expect, it } from "vitest";
import {
  afterCancelAttempt,
  afterCancellation,
  afterProviderEvent,
  canAbandonUnlinked,
} from "./billing.rules";

describe("afterCancellation", () => {
  it("requests a cancel for an open attempt and a refund for a captured one", () => {
    expect(afterCancellation("requires_payment")).toBe("cancel_pending");
    expect(afterCancellation("succeeded")).toBe("refund_pending");
  });
  it("is idempotent", () => {
    for (const s of ["cancel_pending", "cancelled", "refund_pending", "refunded"] as const) {
      expect(afterCancellation(s)).toBe(s);
    }
  });
});

describe("afterProviderEvent", () => {
  it("moves an open attempt to succeeded; a duplicate changes nothing", () => {
    expect(afterProviderEvent("requires_payment", "succeeded")).toBe("succeeded");
    expect(afterProviderEvent("succeeded", "succeeded")).toBe("succeeded");
  });
  it("never moves backwards", () => {
    expect(afterProviderEvent("succeeded", "processing")).toBe("succeeded");
    expect(afterProviderEvent("succeeded", "canceled")).toBe("succeeded");
    expect(afterProviderEvent("refunded", "succeeded")).toBe("refunded");
  });
  it("turns success after a cancel request or a cancel into a refund", () => {
    expect(afterProviderEvent("cancel_pending", "succeeded")).toBe("refund_pending");
    expect(afterProviderEvent("cancelled", "succeeded")).toBe("refund_pending");
  });
  it("accepts a provider-side cancel", () => {
    expect(afterProviderEvent("requires_payment", "canceled")).toBe("cancelled");
    expect(afterProviderEvent("cancel_pending", "canceled")).toBe("cancelled");
  });
});

describe("afterCancelAttempt", () => {
  it("cancels, or refunds when the money had already arrived", () => {
    expect(afterCancelAttempt("cancelled")).toBe("cancelled");
    expect(afterCancelAttempt("already_succeeded")).toBe("refund_pending");
  });
});

describe("canAbandonUnlinked", () => {
  const created = new Date("2026-01-01T00:00:00Z");
  it("waits out the grace period before giving up on a missing provider reference", () => {
    expect(canAbandonUnlinked(created, new Date("2026-01-01T00:05:00Z"))).toBe(false);
    expect(canAbandonUnlinked(created, new Date("2026-01-01T00:11:00Z"))).toBe(true);
  });
});
