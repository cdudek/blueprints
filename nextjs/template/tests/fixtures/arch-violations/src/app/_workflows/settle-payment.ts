/**
 * @workflow settle-payment
 * retry-safe: yes. Settling an already settled payment changes nothing.
 * duplicates: none; the provider event id is stored once.
 * recovery: a failed settle answers 500 and the provider retries.
 * survives-restart: yes. All state is in the database.
 */
import { settleFromWebhook } from "@/modules/billing/server";

export const settlePayment = (id: string) => settleFromWebhook(id);
