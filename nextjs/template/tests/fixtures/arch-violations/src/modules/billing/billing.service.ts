import "server-only";
import type { Tx } from "@/db";
import { operation } from "@/shared/access";
import { ok } from "@/shared/result";
import { findPayment } from "./billing.repository";
export const chargeFn = operation({ access: "user", resource: "own payments" }, async (user) => ok(findPayment()));
export const recordIt = operation({ access: "user", resource: "own payment" }, async (user, id: string, tx: Tx) => ok(id));
export const settleFromWebhook = operation({ access: "webhook", verifiedBy: "signature" }, async (id: string) => ok(id));
