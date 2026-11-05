import { pgTable, text } from "drizzle-orm/pg-core";
export const orders = pgTable("orders", { id: text("id") });
