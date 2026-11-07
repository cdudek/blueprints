import { getTranslations } from "next-intl/server";
import { OrderForm, OrderTable } from "@/modules/orders/public";
import { currentSession } from "@/modules/accounts/server";
import { listMyOrders } from "@/modules/orders/server";
import { cancelOrderAction, placeOrderAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const t = await getTranslations("orders");
  const session = await currentSession();
  if (!session.ok) return <p>{t("signIn")}</p>;

  const result = await listMyOrders(session.value);
  if (!result.ok) return <p>{t("signIn")}</p>;
  const orders = result.value;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <OrderForm checkoutId={crypto.randomUUID()} action={placeOrderAction} />
      {/* map to the fields the table shows: client components never receive whole records */}
      <OrderTable
        orders={orders.map(({ id, status, totalCents, createdAt }) => ({
          id,
          status,
          totalCents,
          createdAt,
        }))}
        cancelAction={cancelOrderAction}
      />
    </main>
  );
}
