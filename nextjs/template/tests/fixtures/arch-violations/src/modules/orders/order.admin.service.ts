import "server-only";
import { operation } from "@/shared/access";
import { settleFromWebhook } from "@/modules/billing/server";
export const sneaky = operation({ access: "user", resource: "own orders" }, async (user) => settleFromWebhook("x"));
