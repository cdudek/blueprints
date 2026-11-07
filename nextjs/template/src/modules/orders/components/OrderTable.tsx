import { useTranslations } from "next-intl";
import { PriceTag } from "@/modules/billing/public";
import { Badge } from "@/ui/Badge";
import type { CancelOrderResponse, OrderRow } from "../order.types";
import { CancelOrderButton } from "./CancelOrderButton";

type Props = { orders: OrderRow[]; cancelAction: (id: string) => Promise<CancelOrderResponse> };

export function OrderTable({ orders, cancelAction }: Props) {
  const t = useTranslations("orders");
  if (orders.length === 0) return <p>{t("empty")}</p>;
  return (
    <table className="text-left">
      <thead>
        <tr>
          <th className="pr-4">{t("columns.order")}</th>
          <th className="pr-4">{t("columns.status")}</th>
          <th className="pr-4">{t("columns.total")}</th>
          <th>
            <span className="sr-only">{t("columns.actions")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td className="pr-4">{order.id.slice(0, 8)}</td>
            <td className="pr-4">
              <Badge tone={order.status === "cancelled" ? "danger" : "neutral"}>
                {t(`status.${order.status}`)}
              </Badge>
            </td>
            <td className="pr-4">
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
