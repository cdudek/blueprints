// The port: a narrow interface named after what the business needs from a payment
// provider. Plain inputs and outputs; no vendor SDK type crosses it.

export type CreateIntentInput = {
  amountCents: number;
  /** Stable per payment attempt, so a retry never creates a second charge. */
  idempotencyKey: string;
};

export type PaymentIntent = { providerRef: string; clientSecret: string };

export type PaymentEvent = {
  id: string;
  type: "succeeded" | "processing" | "canceled";
  providerRef: string;
};

export class InvalidSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
  }
}

export interface PaymentsClient {
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  /** Verifies the signature against the raw body. Throws InvalidSignatureError. */
  parseEvent(rawBody: string, signature: string): PaymentEvent;
}
