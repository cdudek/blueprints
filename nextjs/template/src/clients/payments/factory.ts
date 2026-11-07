import type { Env } from "@/shared/env";
import type { PaymentsClient } from "./base";
import { FixturePaymentsClient } from "./providers/fixture";
import { NoopPaymentsClient } from "./providers/noop";
import { RealPaymentsClient } from "./providers/real";

type Deps = { fetch?: typeof fetch };

/**
 * Builds the real provider only in production with a key; everywhere else a fixture. The fixture
 * accepts a public signature and the noop provider accepts everything, so production refuses both
 * unless the E2E job marks its run with PAYMENTS_STUB=e2e: a stub cannot survive adoption silently.
 */
export function createPaymentsClient(env: Env, deps: Deps = {}): PaymentsClient {
  const provider = env.PAYMENTS_PROVIDER ?? (env.NODE_ENV === "production" ? "real" : "fixture");
  if (provider !== "real" && env.NODE_ENV === "production" && env.PAYMENTS_STUB !== "e2e") {
    throw new Error(
      `the ${provider} payments provider is refused in production; only an E2E run sets PAYMENTS_STUB=e2e`,
    );
  }
  switch (provider) {
    case "noop":
      return new NoopPaymentsClient();
    case "fixture":
      return new FixturePaymentsClient();
    case "real": {
      if (env.NODE_ENV !== "production") {
        throw new Error("the real payments provider is only available in production");
      }
      if (!env.PAYMENTS_API_KEY || !env.PAYMENTS_WEBHOOK_SECRET) {
        throw new Error(
          "the real payments provider needs PAYMENTS_API_KEY and PAYMENTS_WEBHOOK_SECRET",
        );
      }
      return new RealPaymentsClient({
        apiKey: env.PAYMENTS_API_KEY,
        webhookSecret: env.PAYMENTS_WEBHOOK_SECRET,
        fetch: deps.fetch ?? globalThis.fetch,
      });
    }
  }
}
