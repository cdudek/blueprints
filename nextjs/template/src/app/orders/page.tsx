import { getSession } from "@/shared/auth";
import { OrderForm, OrderTable } from "@/modules/orders/public";
import { listMyOrders } from "@/modules/orders/server";
import { cancelOrderAction, placeOrderAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  if (!(await getSession())) return <p>Sign in to see your orders.</p>;

  const orders = await listMyOrders();
  return (
    <main>
      <h1>Orders</h1>
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
