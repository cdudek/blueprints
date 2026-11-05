import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { payments, prices } from "./billing.tables";

export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;
export type PaymentStatus = Payment["status"];
export type Price = InferSelectModel<typeof prices>;

/**
 * The trusted contract between orders and billing. Orders builds it only after loading the
 * order for the signed-in user (`findForUser`), so billing never takes an arbitrary order id or
 * amount from a caller it cannot verify. Billing re-checks that `userId` is the caller, and the
 * database refuses a payment for an order that does not exist (foreign key).
 */
export type AuthorizedOrder = { orderId: string; userId: string; amountCents: number };

export type PaymentStart = { paymentId: string; clientSecret: string };
export type PaymentEventOutcome = { orderId: string; status: PaymentStatus };
export type PaymentWorkSummary = { processed: number; failed: number };
