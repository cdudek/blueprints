import "server-only";
import { inTransaction } from "@/db";
import { operation } from "@/shared/access";
import { ok } from "@/shared/result";
import { chargeFn, recordIt } from "@/modules/billing/server";
import { findOrder } from "./order.repository";
export const placeOrder = operation({ access: "user", resource: "own orders" }, async (user) => ok(findOrder() + (await chargeFn())));
export const cancelOrder = operation({ access: "user", resource: "own orders" }, async (user, id: string) => {
  const done = await inTransaction(async (tx) => {
    await recordIt(id, tx);
    return true;
  });
  return ok(done);
});
