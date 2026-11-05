import { orders } from "@/modules/orders/order.tables";
import type { DbClient } from "@/db";

/** An order row, so payments (which reference orders) have something to belong to. */
export async function seedOrder(db: DbClient, userId: string, totalCents = 1000) {
  const [row] = await db
    .insert(orders)
    .values({
      userId,
      checkoutId: crypto.randomUUID(),
      productId: "widget",
      quantity: 1,
      totalCents,
    })
    .returning({ id: orders.id });
  if (!row) throw new Error("seed failed");
  return row.id;
}
