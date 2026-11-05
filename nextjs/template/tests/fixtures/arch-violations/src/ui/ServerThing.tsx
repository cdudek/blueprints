import "server-only";
import { db } from "@/db";
import { payments } from "@/clients/payments";
export const t = [db, payments];
