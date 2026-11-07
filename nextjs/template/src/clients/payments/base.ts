// The port: a narrow interface named after what the business needs from a payment
// provider. Plain inputs and outputs; no vendor SDK type crosses it.

export type CreateIntentInput = {
  amountCents: number;
  /** Our persisted payment-attempt id. The provider echoes it on every event for this intent. */
  attemptId: string;
  /** Stable per payment attempt, so a retry never creates a second charge. */
  idempotencyKey: string;
};

export type PaymentIntent = { providerRef: string; clientSecret: string };

export type PaymentEvent = {
  id: string;
  type: "succeeded" | "processing" | "canceled";
  /** The attempt id we sent when creating the intent: how an event finds its payment. */
  attemptId: string;
  providerRef: string;
};

export type CancelResult = { result: "cancelled" | "already_succeeded" };

export class InvalidSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
  }
}

export interface PaymentsClient {
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  /**
   * Cancels an open intent. Reports when the money had already been captured. The key is stable
   * per payment attempt (derived from its persisted id), so a retried job never cancels twice.
   */
  cancelIntent(providerRef: string, idempotencyKey: string): Promise<CancelResult>;
  /** Refunds a captured payment in full. The key is stable per attempt: a retry never refunds twice. */
  refund(providerRef: string, idempotencyKey: string): Promise<void>;
  /** Verifies the signature against the raw body. Throws InvalidSignatureError. */
  parseEvent(rawBody: string, signature: string): PaymentEvent;
}
