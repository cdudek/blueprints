"use server";
import { settleFromWebhook } from "@/modules/billing/server";
export async function act(id: string) {
  return settleFromWebhook(id);
}
