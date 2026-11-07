import { recordIt } from "@/modules/billing/server";
// @workflow scattered  retry-safe: yes  duplicates: none  recovery: retry  survives-restart: yes
// (the words are here, but not in the header block at the top of the file)
export const scattered = () => recordIt;
