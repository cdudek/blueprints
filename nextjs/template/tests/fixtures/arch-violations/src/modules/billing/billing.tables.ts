import { pgTable, text } from "drizzle-orm/pg-core";
export const payments = pgTable("payments", { id: text("id") });
export const prices = pgTable("prices", { id: text("id") });
