import { createHmac, timingSafeEqual } from "node:crypto";
import {
  InvalidSignatureError,
  type CancelResult,
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

  private async call(path: string, body: unknown, idempotencyKey?: string): Promise<Response> {
    const response = await this.options.fetch(`https://payments.example.invalid/v1/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`payments provider answered ${response.status}`);
    return response;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const response = await this.call(
      "intents",
      { amount: input.amountCents, metadata: { attemptId: input.attemptId } },
      input.idempotencyKey,
    );
    const body = (await response.json()) as { id: string; client_secret: string };
    return { providerRef: body.id, clientSecret: body.client_secret };
  }

  async cancelIntent(providerRef: string): Promise<CancelResult> {
    const response = await this.call(`intents/${providerRef}/cancel`, {});
    const body = (await response.json()) as { status: string };
    return { result: body.status === "succeeded" ? "already_succeeded" : "cancelled" };
  }

  async refund(providerRef: string): Promise<void> {
    await this.call("refunds", { intent: providerRef }, `refund-${providerRef}`);
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
