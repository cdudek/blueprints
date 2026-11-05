import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { payments } from "@/modules/billing/billing.tables";
import { placeOrder } from "@/modules/orders/order.service";
import { orders } from "@/modules/orders/order.tables";
import { FIXTURE_SIGNATURE } from "@/clients/payments/providers/fixture";
import { db } from "@/shared/db";
import { signInAs } from "@tests/helpers/auth-mock";
import { resetData } from "@tests/helpers/db-mock";
import { POST } from "./route";

vi.mock("@/shared/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));
vi.mock("@/shared/auth", () => import("@tests/helpers/auth-mock").then((m) => m.authMock));

const request = (body: string, signature?: string) =>
  new Request("http://localhost/api/webhooks/payments", {
    method: "POST",
    body,
    headers: signature ? { "x-payments-signature": signature } : {},
  });

async function placedOrder() {
  const placed = await placeOrder({
    checkoutId: "00000000-0000-4000-8000-0000000000c1",
    productId: "widget",
    quantity: 1,
  });
  if (!placed.ok) throw new Error("setup failed");
  const [payment] = await db.select().from(payments);
  return { orderId: placed.value.orderId, providerRef: payment?.providerRef ?? "" };
}
const succeeded = (providerRef: string) =>
  JSON.stringify({ id: "evt_1", type: "succeeded", providerRef });

beforeEach(async () => {
  await resetData(db);
  signInAs("u1");
});

describe("payments webhook", () => {
  it("answers 400 without a signature and on a bad one", async () => {
    expect((await POST(request("{}"))).status).toBe(400);
    expect((await POST(request("{}", "wrong"))).status).toBe(400);
  });

  it("marks the order paid, and a duplicate delivery changes nothing more", async () => {
    const { orderId, providerRef } = await placedOrder();
    expect((await POST(request(succeeded(providerRef), FIXTURE_SIGNATURE))).status).toBe(200);
    expect((await POST(request(succeeded(providerRef), FIXTURE_SIGNATURE))).status).toBe(200);
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row?.status).toBe("paid");
  });
});
