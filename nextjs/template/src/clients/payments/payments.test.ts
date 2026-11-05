import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { getEnv } from "@/shared/env";
import { InvalidSignatureError } from "./base";
import { createPaymentsClient } from "./factory";
import { FixturePaymentsClient } from "./providers/fixture";
import { NoopPaymentsClient } from "./providers/noop";
import { RealPaymentsClient } from "./providers/real";

const env = (overrides: Record<string, string>) => getEnv({ NODE_ENV: "test", ...overrides });

describe("factory", () => {
  it("builds the fixture provider by default outside production", () => {
    expect(createPaymentsClient(env({}))).toBeInstanceOf(FixturePaymentsClient);
    expect(createPaymentsClient(env({ PAYMENTS_PROVIDER: "noop" }))).toBeInstanceOf(
      NoopPaymentsClient,
    );
  });

  it("refuses to build the real provider outside production", () => {
    const real = env({
      PAYMENTS_PROVIDER: "real",
      PAYMENTS_API_KEY: "k",
      PAYMENTS_WEBHOOK_SECRET: "s",
    });
    expect(() => createPaymentsClient(real)).toThrow("only available in production");
  });

  it("refuses the real provider in production without a key", () => {
    expect(() => createPaymentsClient(env({ NODE_ENV: "production" }))).toThrow(
      "needs PAYMENTS_API_KEY",
    );
  });

  it("builds the real provider in production with a key", () => {
    const production = env({
      NODE_ENV: "production",
      PAYMENTS_API_KEY: "k",
      PAYMENTS_WEBHOOK_SECRET: "s",
    });
    expect(createPaymentsClient(production, { fetch: vi.fn() })).toBeInstanceOf(RealPaymentsClient);
  });
});

describe("real provider", () => {
  it("talks only through the fetch it is given", async () => {
    const fake = vi.fn(async () => Response.json({ id: "pi_1", client_secret: "sec_1" }));
    const client = new RealPaymentsClient({ apiKey: "k", webhookSecret: "s", fetch: fake });
    expect(await client.createIntent({ amountCents: 500, idempotencyKey: "a1" })).toEqual({
      providerRef: "pi_1",
      clientSecret: "sec_1",
    });
    expect(fake).toHaveBeenCalledOnce();
  });

  it("verifies the webhook signature against the raw body", () => {
    const client = new RealPaymentsClient({ apiKey: "k", webhookSecret: "s", fetch: vi.fn() });
    const body = JSON.stringify({ id: "e", type: "succeeded", providerRef: "pi_1" });
    const good = createHmac("sha256", "s").update(body).digest("hex");
    expect(client.parseEvent(body, good).providerRef).toBe("pi_1");
    expect(() => client.parseEvent(body, "bad")).toThrow(InvalidSignatureError);
  });
});

describe("no live network in tests", () => {
  it("fails any test that reaches the global fetch", () => {
    expect(() => fetch("https://example.invalid")).toThrow("global fetch reached in a test");
  });
});
