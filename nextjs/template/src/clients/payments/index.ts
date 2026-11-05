import "server-only";
import { getEnv } from "@/shared/env";
import type { PaymentsClient } from "./base";
import { createPaymentsClient } from "./factory";

export { InvalidSignatureError } from "./base";

let client: PaymentsClient | undefined;

/** The one place the app gets a payments client. */
export function payments(): PaymentsClient {
  client ??= createPaymentsClient(getEnv());
  return client;
}
