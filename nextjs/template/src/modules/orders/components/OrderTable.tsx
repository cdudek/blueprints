import { PriceTag } from "@/modules/billing/public";
import { Badge } from "@/ui";
import type { CancelOrderResponse, OrderRow } from "../order.types";
import { CancelOrderButton } from "./CancelOrderButton";

type Props = { orders: OrderRow[]; cancelAction: (id: string) => Promise<CancelOrderResponse> };

export function OrderTable({ orders, cancelAction }: Props) {
  if (orders.length === 0) return <p>No orders yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Order</th>
          <th>Status</th>
          <th>Total</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td>{order.id.slice(0, 8)}</td>
            <td>
              <Badge tone={order.status === "cancelled" ? "danger" : "neutral"}>{order.status}</Badge>
            </td>
            <td>
              <PriceTag cents={order.totalCents} />
            </td>
            <td>
              {order.status === "pending" || order.status === "paid" ? (
                <CancelOrderButton orderId={order.id} action={cancelAction} />
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
