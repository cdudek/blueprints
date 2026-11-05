import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { orders } from "./order.tables";

export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;
export type OrderStatus = Order["status"];

// Typed expected failures: a caller (and the UI) can branch on the kind.
export type PlaceOrderError =
  | "unauthenticated"
  | "forbidden"
  | "invalid_product"
  | "unknown_product"
  | "checkout_conflict"
  | "checkout_cancelled"
  | "not_payable";
type CancelOrderError =
  "unauthenticated" | "forbidden" | "not_found" | "not_cancellable" | "window_closed" | "changed";

export type PlaceOrderSuccess = { orderId: string; clientSecret: string | null };

// DTOs: what actions return and components receive. Never a raw record.
export type OrderRow = Pick<Order, "id" | "status" | "totalCents" | "createdAt">;
export type PlaceOrderResponse =
  ({ ok: true } & PlaceOrderSuccess) | { ok: false; error: PlaceOrderError | "invalid_input" };
export type CancelOrderResponse =
  { ok: true } | { ok: false; error: CancelOrderError | "invalid_input" };
