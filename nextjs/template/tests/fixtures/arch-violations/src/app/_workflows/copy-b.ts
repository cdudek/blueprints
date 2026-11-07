/**
 * @workflow copy-b
 * retry-safe: yes.
 * duplicates: none.
 * recovery: retry.
 * survives-restart: yes.
 */
import { chargeFn } from "@/modules/billing/server";

export const copyb = () => chargeFn;
