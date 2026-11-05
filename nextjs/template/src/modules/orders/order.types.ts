import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { orders } from "./order.tables";

export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;
export type OrderStatus = Order["status"];

// DTOs: what actions return and components receive. Never a raw record.
export type OrderRow = Pick<Order, "id" | "status" | "totalCents" | "createdAt">;
export type PlaceOrderResponse =
  | { ok: true; orderId: string; clientSecret: string | null }
  | { ok: false; error: string };
export type CancelOrderResponse = { ok: true } | { ok: false; error: string };
