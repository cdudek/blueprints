import { operation } from "@/shared/access";
import { ok } from "@/shared/result";
export const listEntries = async () => [];
export async function addEntry() {
  return 1;
}
export const closeBooks = operation({ access: "job", triggeredBy: "cron" }, async () => ok(1));
