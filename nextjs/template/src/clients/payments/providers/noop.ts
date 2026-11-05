import type { CancelResult, PaymentEvent, PaymentIntent, PaymentsClient } from "../base";

/** Accepts everything, does nothing. For environments that must not take payments. */
export class NoopPaymentsClient implements PaymentsClient {
  async createIntent(): Promise<PaymentIntent> {
    return { providerRef: "noop", clientSecret: "noop" };
  }

  async cancelIntent(): Promise<CancelResult> {
    return { result: "cancelled" };
  }

  async refund(): Promise<void> {}

  parseEvent(): PaymentEvent {
    return { id: "noop", type: "processing", attemptId: "noop", providerRef: "noop" };
  }
}
