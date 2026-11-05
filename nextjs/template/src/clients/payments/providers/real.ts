import { createHmac, timingSafeEqual } from "node:crypto";
import {
  InvalidSignatureError,
  type CreateIntentInput,
  type PaymentEvent,
  type PaymentIntent,
  type PaymentsClient,
} from "../base";

type Options = {
  apiKey: string;
  webhookSecret: string;
  /** Injected, never the global: no test can reach a live API by accident. */
  fetch: typeof fetch;
};

/**
 * STUB of a real provider. The endpoint is a placeholder: point it at your vendor and map
 * its responses to the port's types here. The factory builds this only in production.
 */
export class RealPaymentsClient implements PaymentsClient {
  constructor(private readonly options: Options) {}

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const response = await this.options.fetch("https://payments.example.invalid/v1/intents", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "idempotency-key": input.idempotencyKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount: input.amountCents }),
    });
    if (!response.ok) throw new Error(`payments provider answered ${response.status}`);
    const body = (await response.json()) as { id: string; client_secret: string };
    return { providerRef: body.id, clientSecret: body.client_secret };
  }

  parseEvent(rawBody: string, signature: string): PaymentEvent {
    const expected = createHmac("sha256", this.options.webhookSecret).update(rawBody).digest("hex");
    const given = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new InvalidSignatureError();
    }
    return JSON.parse(rawBody) as PaymentEvent;
  }
}
