import {
  InvalidSignatureError,
  type CancelResult,
  type CreateIntentInput,
  type PaymentEvent,
  type PaymentIntent,
  type PaymentsClient,
} from "../base";

export const FIXTURE_SIGNATURE = "fixture-signature";

/** Canned responses for tests and local development. Never touches the network. */
export class FixturePaymentsClient implements PaymentsClient {
  readonly intents: CreateIntentInput[] = [];
  readonly cancelled: string[] = [];
  readonly refunded: string[] = [];
  /** Provider references whose money is already captured: cancelling them reports it. */
  readonly captured = new Set<string>();
  /** Make the next provider call fail, to exercise retries. */
  failNext = false;

  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("fixture provider failure");
    }
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    this.maybeFail();
    this.intents.push(input);
    return {
      providerRef: `pi_fixture_${input.idempotencyKey}`,
      clientSecret: `secret_fixture_${input.idempotencyKey}`,
    };
  }

  async cancelIntent(providerRef: string): Promise<CancelResult> {
    this.maybeFail();
    if (this.captured.has(providerRef)) return { result: "already_succeeded" };
    this.cancelled.push(providerRef);
    return { result: "cancelled" };
  }

  async refund(providerRef: string): Promise<void> {
    this.maybeFail();
    this.refunded.push(providerRef);
  }

  parseEvent(rawBody: string, signature: string): PaymentEvent {
    if (signature !== FIXTURE_SIGNATURE) throw new InvalidSignatureError();
    return JSON.parse(rawBody) as PaymentEvent;
  }
}
