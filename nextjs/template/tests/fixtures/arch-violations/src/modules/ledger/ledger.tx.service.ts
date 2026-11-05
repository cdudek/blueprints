import "server-only";
import { db, inTransaction, type Tx } from "@/db";
import { operation } from "@/shared/access";
import { ok } from "@/shared/result";
import { payments as pay } from "@/clients/payments";
import { chargeFn } from "@/modules/billing/server";
import { missingCallback } from "./elsewhere";
export const settle = operation({ access: "user", resource: "own ledger" }, async (user) => {
  await inTransaction(async (tx) => {
    await pay().createIntent();
    await fetch("https://example.invalid");
    await chargeFn();
    await inTransaction(async () => {});
  });
  await db.transaction(async () => {});
  await inTransaction(missingCallback);
  return ok(1);
});
export async function receivesTx(tx: Tx) {
  await inTransaction(async () => {});
}
