import {
  InvalidSignatureError,
  type CreateIntentInput,
  type PaymentEvent,
  type PaymentIntent,
  type PaymentsClient,
} from "../base";

export const FIXTURE_SIGNATURE = "fixture-signature";

/** Canned responses for tests and local development. Never touches the network. */
export class FixturePaymentsClient implements PaymentsClient {
  readonly intents: CreateIntentInput[] = [];

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    this.intents.push(input);
    return {
      providerRef: `pi_fixture_${input.idempotencyKey}`,
      clientSecret: `secret_fixture_${input.idempotencyKey}`,
    };
  }

  parseEvent(rawBody: string, signature: string): PaymentEvent {
    if (signature !== FIXTURE_SIGNATURE) throw new InvalidSignatureError();
    return JSON.parse(rawBody) as PaymentEvent;
  }
}
