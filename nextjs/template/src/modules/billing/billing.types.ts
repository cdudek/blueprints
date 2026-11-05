import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { payments, prices } from "./billing.tables";

export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;
export type PaymentStatus = Payment["status"];
export type Price = InferSelectModel<typeof prices>;

export type PaymentStart = { paymentId: string; clientSecret: string };
export type PaymentEventOutcome = { orderId: string; status: PaymentStatus };
