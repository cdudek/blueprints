import { pgTable, text } from "drizzle-orm/pg-core";
export const payments = pgTable("payments", { id: text("id") });
export const invoices = pgTable("invoices", { id: text("id") });
