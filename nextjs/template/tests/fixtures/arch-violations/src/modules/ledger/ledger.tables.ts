import { pgTable, text } from "drizzle-orm/pg-core";
export const entries = pgTable("entries", { id: text("id") });
export const payments = pgTable("payments", { id: text("id") });
