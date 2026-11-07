/**
 * @workflow copy-a
 * retry-safe: yes.
 * duplicates: none.
 * recovery: retry.
 * survives-restart: yes.
 */
import { chargeFn } from "@/modules/billing/server";

export const copya = () => chargeFn;
