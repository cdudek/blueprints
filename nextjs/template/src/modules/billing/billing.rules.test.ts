import { describe, expect, it } from "vitest";
import { afterCancellation, afterProviderEvent } from "./billing.rules";

describe("afterCancellation", () => {
  it("cancels an open attempt and refunds a captured one", () => {
    expect(afterCancellation("requires_payment")).toBe("cancelled");
    expect(afterCancellation("succeeded")).toBe("refund_pending");
  });
  it("is idempotent", () => {
    expect(afterCancellation("cancelled")).toBe("cancelled");
    expect(afterCancellation("refund_pending")).toBe("refund_pending");
  });
});

describe("afterProviderEvent", () => {
  it("moves an open attempt to succeeded", () => {
    expect(afterProviderEvent("requires_payment", "succeeded")).toBe("succeeded");
  });
  it("treats a duplicate success as a no-op", () => {
    expect(afterProviderEvent("succeeded", "succeeded")).toBe("succeeded");
  });
  it("never moves backwards", () => {
    expect(afterProviderEvent("succeeded", "processing")).toBe("succeeded");
    expect(afterProviderEvent("succeeded", "canceled")).toBe("succeeded");
  });
  it("turns a late success after a cancel into a refund", () => {
    expect(afterProviderEvent("cancelled", "succeeded")).toBe("refund_pending");
  });
});
