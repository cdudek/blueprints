import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, type DbClient } from "@/shared/db";
import { orders } from "./order.tables";
import type { NewOrder, Order, OrderStatus } from "./order.types";

// Every method takes an optional transaction client; the calling service owns the boundary.
export const orderRepository = {
  async findForUser(id: string, userId: string, c: DbClient = db): Promise<Order | null> {
    const [row] = await c
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  async findById(id: string, c: DbClient = db): Promise<Order | null> {
    const [row] = await c.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ?? null;
  },

  listForUser(userId: string, c: DbClient = db): Promise<Order[]> {
    return c.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  },

  // Create, or return the existing order for this user's checkout. Safe under concurrent submits:
  // the unique (user, checkout) key decides, the loser reads the winner's row.
  async findOrCreateByCheckout(data: NewOrder, c: DbClient = db): Promise<Order> {
    const [created] = await c
      .insert(orders)
      .values(data)
      .onConflictDoNothing({ target: [orders.userId, orders.checkoutId] })
      .returning();
    if (created) return created;
    const [existing] = await c
      .select()
      .from(orders)
      .where(and(eq(orders.userId, data.userId), eq(orders.checkoutId, data.checkoutId)))
      .limit(1);
    if (!existing) throw new Error("order vanished after a checkout conflict");
    return existing;
  },

  // Cancel only if nothing changed since the service read the order, and the window still
  // holds at write time. Same constants as the rules: the check and the write cannot disagree.
  async cancelIfUnchanged(
    id: string,
    userId: string,
    expected: OrderStatus,
    cutoff: Date,
    c: DbClient = db,
  ): Promise<boolean> {
    const changed = await c
      .update(orders)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(orders.id, id),
          eq(orders.userId, userId),
          eq(orders.status, expected),
          gte(orders.createdAt, cutoff),
        ),
      )
      .returning({ id: orders.id });
    return changed.length === 1;
  },

  async transition(id: string, from: OrderStatus, to: OrderStatus, c: DbClient = db): Promise<boolean> {
    const changed = await c
      .update(orders)
      .set({ status: to })
      .where(and(eq(orders.id, id), eq(orders.status, from)))
      .returning({ id: orders.id });
    return changed.length === 1;
  },
};
