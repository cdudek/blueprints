import { pgTable, text } from "drizzle-orm/pg-core";
export const orders = pgTable("orders", { id: text("id") });
export const invoices = pgTable("invoices", { id: text("id") });
