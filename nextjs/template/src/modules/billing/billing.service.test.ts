import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { payments as paymentsClient } from "@/clients/payments";
import {
  FIXTURE_SIGNATURE,
  type FixturePaymentsClient,
} from "@/clients/payments/providers/fixture";
import { db, inTransaction } from "@/db";
import { policyOf } from "@/shared/access";
import { signInAs } from "@tests/helpers/auth-mock";
import { resetData } from "@tests/helpers/db-mock";
import { seedOrder } from "@tests/helpers/seed";
import { billingRepository } from "./billing.repository";
import {
  priceFor,
  processPaymentWorkFromJob,
  receivePaymentEventFromWebhook,
  recordCancellation,
  startPayment,
} from "./billing.service";
import { paymentInbox, payments } from "./billing.tables";
import type { PaymentStatus } from "./billing.types";

vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));
vi.mock("@/shared/auth", () => import("@tests/helpers/auth-mock").then((m) => m.authMock));

const provider = () => paymentsClient() as FixturePaymentsClient;
const only = async () => (await db.select().from(payments))[0];
const setStatus = (status: PaymentStatus) => db.update(payments).set({ status });
const event = (type: string, attemptId: string, providerRef: string, id = `evt_${type}`) =>
  JSON.stringify({ id, type, attemptId, providerRef });

async function started(userId = "u1") {
  const orderId = await seedOrder(db, userId);
  const result = await startPayment({ orderId, userId, amountCents: 1000 });
  if (!result.ok) throw new Error("setup failed");
  const payment = await only();
  if (!payment) throw new Error("setup failed");
  return { orderId, payment };
}

beforeEach(async () => {
  await resetData(db);
  signInAs("u1");
});

describe("access policies", () => {
  it("declares one policy per operation, none of them implied by a name", () => {
    expect(policyOf(priceFor)).toMatchObject({ access: "public" });
    expect(policyOf(startPayment)).toMatchObject({ access: "user" });
    expect(policyOf(receivePaymentEventFromWebhook)).toMatchObject({ access: "webhook" });
    expect(policyOf(processPaymentWorkFromJob)).toMatchObject({ access: "job" });
  });

  it("answers a typed unauthenticated error for a user operation", async () => {
    signInAs(null);
    expect(await startPayment({ orderId: "x", userId: "u1", amountCents: 1 })).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });
});

describe("priceFor (public)", () => {
  it("validates input and reads the catalog without a session", async () => {
    signInAs(null);
    expect(await priceFor("widget")).toEqual({ ok: true, value: { unitCents: 1250 } });
    expect(await priceFor("nope")).toEqual({ ok: false, error: "unknown_product" });
    expect(await priceFor("")).toEqual({ ok: false, error: "invalid_product" });
  });
});

describe("startPayment", () => {
  it("returns the same attempt and client secret on retry", async () => {
    const orderId = await seedOrder(db, "u1");
    const order = { orderId, userId: "u1", amountCents: 1000 };
    const first = await startPayment(order);
    const second = await startPayment(order);
    expect(first).toEqual(second);
    expect(await db.select().from(payments)).toHaveLength(1);
    const attempt = await only();
    expect(provider().intents.filter((i) => i.attemptId === attempt?.id)).toHaveLength(1);
  });

  it("refuses an order that is not the caller's", async () => {
    const orderId = await seedOrder(db, "u2");
    expect(await startPayment({ orderId, userId: "u2", amountCents: 1000 })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("refuses a payment for an order that does not exist (foreign key)", async () => {
    await expect(
      startPayment({ orderId: crypto.randomUUID(), userId: "u1", amountCents: 1 }),
    ).rejects.toThrow();
  });

  it("never gives a cancelled attempt a fresh intent", async () => {
    const { orderId } = await started();
    await inTransaction((tx) => recordCancellation(orderId, tx));
    expect(await startPayment({ orderId, userId: "u1", amountCents: 1000 })).toEqual({
      ok: false,
      error: "not_payable",
    });
  });
});

describe("recordCancellation", () => {
  it("is idempotent, refunds a captured payment and refuses another user's", async () => {
    const { orderId, payment } = await started();
    await setStatus("succeeded");
    await inTransaction((tx) => recordCancellation(orderId, tx));
    await inTransaction((tx) => recordCancellation(orderId, tx));
    expect((await only())?.status).toBe("refund_pending");
    signInAs("u2");
    expect(await inTransaction((tx) => recordCancellation(orderId, tx))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(payment.userId).toBe("u1");
  });

  it("recomputes after a lost conditional update instead of reporting success", async () => {
    const { orderId, payment } = await started();
    // the success webhook wins the race: it moves the row between our read and our write
    const real = billingRepository.transition.bind(billingRepository);
    const spy = vi
      .spyOn(billingRepository, "transition")
      .mockImplementationOnce(async (...args) => {
        // through the transaction's own connection: PGlite has just one
        await args[3]
          ?.update(payments)
          .set({ status: "succeeded" })
          .where(eq(payments.id, payment.id));
        return real(...args);
      });
    await inTransaction((tx) => recordCancellation(orderId, tx));
    spy.mockRestore();
    // cancel_pending would have been wrong: the money arrived, so it must be refunded
    expect((await only())?.status).toBe("refund_pending");
  });
});

describe("receivePaymentEventFromWebhook", () => {
  it("rejects a bad signature", async () => {
    expect(await receivePaymentEventFromWebhook("{}", "wrong")).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });

  it("changes state once when the same event is delivered twice", async () => {
    const { payment } = await started();
    const body = event("succeeded", payment.id, payment.providerRef ?? "");
    const first = await receivePaymentEventFromWebhook(body, FIXTURE_SIGNATURE);
    const second = await receivePaymentEventFromWebhook(body, FIXTURE_SIGNATURE);
    expect(first).toEqual(second);
    expect((await only())?.status).toBe("succeeded");
  });

  it("never moves an attempt backwards on an out-of-order event", async () => {
    const { payment } = await started();
    const ref = payment.providerRef ?? "";
    await receivePaymentEventFromWebhook(event("succeeded", payment.id, ref), FIXTURE_SIGNATURE);
    await receivePaymentEventFromWebhook(event("processing", payment.id, ref), FIXTURE_SIGNATURE);
    expect((await only())?.status).toBe("succeeded");
  });

  it("records a refund when success arrives after a cancel", async () => {
    const { orderId, payment } = await started();
    await inTransaction((tx) => recordCancellation(orderId, tx));
    await receivePaymentEventFromWebhook(
      event("succeeded", payment.id, payment.providerRef ?? ""),
      FIXTURE_SIGNATURE,
    );
    expect((await only())?.status).toBe("refund_pending");
  });

  it("finds its payment when the event beats our own bookkeeping (before attachIntent)", async () => {
    const orderId = await seedOrder(db, "u1");
    // the attempt exists, but the provider reference has not been stored yet
    const payment = await billingRepository.findOrCreatePayment({
      orderId,
      userId: "u1",
      amountCents: 1000,
    });
    expect(payment.providerRef).toBeNull();
    const result = await receivePaymentEventFromWebhook(
      event("succeeded", payment.id, "pi_early"),
      FIXTURE_SIGNATURE,
    );
    expect(result).toEqual({ ok: true, value: { orderId, status: "succeeded" } });
    expect((await only())?.providerRef).toBe("pi_early");
  });

  it("stores an unmatched event in the inbox before it is acknowledged", async () => {
    const result = await receivePaymentEventFromWebhook(
      event("succeeded", crypto.randomUUID(), "pi_unknown", "evt_lost"),
      FIXTURE_SIGNATURE,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect((await db.select().from(paymentInbox)).map((r) => r.eventId)).toEqual(["evt_lost"]);
    // a redelivery does not duplicate it
    await receivePaymentEventFromWebhook(
      event("succeeded", crypto.randomUUID(), "pi_unknown", "evt_lost"),
      FIXTURE_SIGNATURE,
    );
    expect(await db.select().from(paymentInbox)).toHaveLength(1);
  });

  it("treats a malformed attempt id as unmatched, not as a crash", async () => {
    const result = await receivePaymentEventFromWebhook(
      event("succeeded", "not-a-uuid", "pi_x", "evt_bad"),
      FIXTURE_SIGNATURE,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect(await db.select().from(paymentInbox)).toHaveLength(1);
  });
});

describe("processPaymentWorkFromJob (cancel and refund worker)", () => {
  const run = () => processPaymentWorkFromJob(new Date());

  it("cancels the open intent at the provider", async () => {
    const { orderId, payment } = await started();
    await inTransaction((tx) => recordCancellation(orderId, tx));
    expect(await run()).toEqual({ ok: true, value: { processed: 1, failed: 0 } });
    expect((await only())?.status).toBe("cancelled");
    expect(provider().cancelled).toContain(payment.providerRef);
  });

  it("refunds a captured payment", async () => {
    const { orderId, payment } = await started();
    await setStatus("succeeded");
    await inTransaction((tx) => recordCancellation(orderId, tx));
    await run();
    expect((await only())?.status).toBe("refunded");
    expect(provider().refunded).toContain(payment.providerRef);
  });

  it("turns 'already captured' at cancel time into a refund", async () => {
    const { orderId, payment } = await started();
    await inTransaction((tx) => recordCancellation(orderId, tx));
    provider().captured.add(payment.providerRef ?? "");
    await run();
    expect((await only())?.status).toBe("refund_pending");
    await run();
    expect((await only())?.status).toBe("refunded");
  });

  it("retries after a provider failure and counts the attempt", async () => {
    const { orderId } = await started();
    await inTransaction((tx) => recordCancellation(orderId, tx));
    provider().failNext = true;
    expect(await run()).toEqual({ ok: true, value: { processed: 0, failed: 1 } });
    expect(await only()).toMatchObject({ status: "cancel_pending", attempts: 1 });
    expect(await run()).toEqual({ ok: true, value: { processed: 1, failed: 0 } });
    expect((await only())?.status).toBe("cancelled");
  });

  it("waits for a missing provider reference, then abandons it after the grace period", async () => {
    const orderId = await seedOrder(db, "u1");
    await billingRepository.findOrCreatePayment({ orderId, userId: "u1", amountCents: 1000 });
    await inTransaction((tx) => recordCancellation(orderId, tx));
    await run();
    expect((await only())?.status).toBe("cancel_pending");
    await processPaymentWorkFromJob(new Date(Date.now() + 11 * 60 * 1000));
    expect((await only())?.status).toBe("cancelled");
  });
});
