import type { PaymentStatus } from "./billing.types";

export type ProviderEventType = "succeeded" | "processing" | "canceled";

/** What a cancel request does to a payment attempt. A captured payment is refunded, not released. */
export function afterCancellation(status: PaymentStatus): PaymentStatus {
  if (status === "requires_payment") return "cancel_pending";
  if (status === "succeeded") return "refund_pending";
  return status; // already cancelling, cancelled or refunding: idempotent
}

/**
 * What a provider event does to a payment attempt. State-based and order-insensitive:
 * a duplicate changes nothing and an old event never moves an attempt backwards.
 */
export function afterProviderEvent(status: PaymentStatus, event: ProviderEventType): PaymentStatus {
  if (event === "succeeded") {
    // money arrived for an attempt that was cancelled: it must be refunded
    if (status === "cancel_pending" || status === "cancelled") return "refund_pending";
    if (status === "requires_payment") return "succeeded";
    return status;
  }
  if (event === "canceled" && (status === "requires_payment" || status === "cancel_pending")) {
    return "cancelled";
  }
  return status; // processing, or a cancel arriving after success: never go backwards
}

/** What the provider's answer to "cancel this intent" means for a cancel_pending attempt. */
export function afterCancelAttempt(result: "cancelled" | "already_succeeded"): PaymentStatus {
  return result === "cancelled" ? "cancelled" : "refund_pending";
}

const UNLINKED_GRACE_MS = 10 * 60 * 1000;

/**
 * A cancel_pending attempt with no provider reference is either about to get one (intent
 * creation in flight) or never will. After the grace period there is nothing to cancel.
 */
export function canAbandonUnlinked(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > UNLINKED_GRACE_MS;
}
