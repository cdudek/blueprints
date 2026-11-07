"use server";
// reads the session through the session module (ledger in this fixture), then calls one module:
// no workflow header needed
import { listEntries } from "@/modules/ledger/server";
import { placeOrder } from "@/modules/orders/server";

export async function placeAction() {
  await listEntries();
  return placeOrder();
}
