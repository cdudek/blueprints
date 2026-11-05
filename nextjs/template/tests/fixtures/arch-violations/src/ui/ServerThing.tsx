import "server-only";
import { db } from "@/shared/db";
import { payments } from "@/clients/payments";
export const t = [db, payments];
