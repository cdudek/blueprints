import type { PaymentEvent, PaymentIntent, PaymentsClient } from "../base";

/** Accepts everything, does nothing. For environments that must not take payments. */
export class NoopPaymentsClient implements PaymentsClient {
  async createIntent(): Promise<PaymentIntent> {
    return { providerRef: "noop", clientSecret: "noop" };
  }

  parseEvent(): PaymentEvent {
    return { id: "noop", type: "processing", providerRef: "noop" };
  }
}
