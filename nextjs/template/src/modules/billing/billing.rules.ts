import type { PaymentStatus } from "./billing.types";

export type ProviderEventType = "succeeded" | "processing" | "canceled";

/** What a cancel request does to a payment attempt. A captured payment is refunded, not released. */
export function afterCancellation(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "requires_payment":
      return "cancelled";
    case "succeeded":
      return "refund_pending";
    default:
      return status; // already cancelled or refunding: idempotent
  }
}

/**
 * What a provider event does to a payment attempt. State-based and order-insensitive:
 * a duplicate changes nothing and an old event never moves an attempt backwards.
 */
export function afterProviderEvent(status: PaymentStatus, event: ProviderEventType): PaymentStatus {
  if (event === "succeeded") {
    // late success after a cancel: the money arrived, so it must be refunded
    if (status === "cancelled") return "refund_pending";
    if (status === "requires_payment") return "succeeded";
    return status;
  }
  if (event === "canceled" && status === "requires_payment") return "cancelled";
  return status; // processing, or a cancel arriving after success: never go backwards
}
