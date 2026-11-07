// The worker against a real Postgres: every side commits for real on its own connection, the way
// two worker processes do. A single connection (PGlite) or a rolled-back transaction would hide
// exactly what these tests are for, so they run only where TEST_DATABASE_URL is set (CI).
import { makeWorkerUtils, runOnce } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import { payments as paymentsClient } from "@/clients/payments";
import type { FixturePaymentsClient } from "@/clients/payments/providers/fixture";
import * as dbModule from "@/db";
import { billingRepository } from "@/modules/billing/billing.repository";
import { seedOrder } from "@tests/helpers/seed";
import { taskList } from "@/worker";

vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));

const { db } = dbModule;
const url = (dbModule as unknown as { testUrl?: string }).testUrl;
const provider = () => paymentsClient() as FixturePaymentsClient;

async function refundPending() {
  const orderId = await seedOrder(db, "u1");
  const payment = await billingRepository.findOrCreatePayment({
    orderId,
    userId: "u1",
    amountCents: 1000,
  });
  await billingRepository.attachIntent(payment.id, `pi_${payment.id}`, null);
  await billingRepository.transition(payment.id, "requires_payment", "refund_pending");
  return payment.id;
}

describe.skipIf(!url)("the worker on real Postgres", () => {
  it("two workers draining one refund refund it once: same key, one final state", async () => {
    const id = await refundPending();
    const mark = provider().idempotencyKeys.length;
    const work = taskList["payments-work"] as (payload: unknown, helpers: unknown) => Promise<void>;
    await Promise.all([work({}, {}), work({}, {})]);
    const keys = provider().idempotencyKeys.slice(mark);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(new Set(keys)).toEqual(new Set([`${id}:refund`]));
    expect((await billingRepository.findPaymentById(id))?.status).toBe("refunded");
  });

  it("the job key keeps one pending copy, and a run drains it", async () => {
    const id = await refundPending();
    const utils = await makeWorkerUtils({ connectionString: url });
    try {
      await utils.migrate();
      await utils.addJob("payments-work", {}, { jobKey: "payments-work" });
      await utils.addJob("payments-work", {}, { jobKey: "payments-work" });
      const pending = await utils.withPgClient((client) =>
        client.query("select count(*)::int as n from graphile_worker._private_jobs"),
      );
      expect(pending.rows[0]).toEqual({ n: 1 });
      await runOnce({ connectionString: url, taskList });
      expect((await billingRepository.findPaymentById(id))?.status).toBe("refunded");
    } finally {
      await utils.release();
    }
  });
});
