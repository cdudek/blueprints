"use server";
import { settlePayment } from "@/app/_workflows/settle-payment";

export async function settleAction() {
  return settlePayment("x");
}
