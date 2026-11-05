import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/shared/db";
import { signInAs } from "@tests/helpers/auth-mock";
import { resetData } from "@tests/helpers/db-mock";
import {
  priceFor,
  receivePaymentEventFromWebhook,
  recordCancellation,
  startPayment,
} from "./billing.service";
import { payments } from "./billing.tables";

vi.mock("@/shared/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));
vi.mock("@/shared/auth", () => import("@tests/helpers/auth-mock").then((m) => m.authMock));

const ORDER = "00000000-0000-4000-8000-0000000000aa";
const SIGNATURE = "fixture-signature";
const event = (type: string, providerRef: string) =>
  JSON.stringify({ id: `evt_${type}`, type, providerRef });
const only = async () => (await db.select().from(payments))[0];

beforeEach(async () => {
  await resetData(db);
  signInAs("u1");
});

describe("priceFor", () => {
  it("reads the catalog and refuses unknown products", async () => {
    expect(await priceFor("widget")).toEqual({ ok: true, value: { unitCents: 1250 } });
    expect(await priceFor("nope")).toEqual({ ok: false, error: "unknown product" });
  });
});

describe("startPayment", () => {
  it("returns the same attempt and client secret on retry", async () => {
    const first = await startPayment(ORDER, 1000);
    const second = await startPayment(ORDER, 1000);
    expect(first).toEqual(second);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("refuses to hand another user's attempt to the caller", async () => {
    await startPayment(ORDER, 1000);
    signInAs("u2");
    expect(await startPayment(ORDER, 1000)).toEqual({ ok: false, error: "not allowed" });
  });
});

describe("recordCancellation", () => {
  it("is idempotent and refunds a captured payment", async () => {
    await startPayment(ORDER, 1000);
    await db.update(payments).set({ status: "succeeded" });
    await recordCancellation(ORDER);
    await recordCancellation(ORDER);
    expect((await only())?.status).toBe("refund_pending");
  });

  it("refuses to touch another user's payment", async () => {
    await startPayment(ORDER, 1000);
    signInAs("u2");
    expect(await recordCancellation(ORDER)).toEqual({ ok: false, error: "not allowed" });
    expect((await only())?.status).toBe("requires_payment");
  });
});

describe("receivePaymentEventFromWebhook", () => {
  it("rejects a bad signature", async () => {
    expect(await receivePaymentEventFromWebhook("{}", "wrong")).toEqual({
      ok: false,
      error: "invalid signature",
    });
  });

  it("changes state once when the same event is delivered twice", async () => {
    await startPayment(ORDER, 1000);
    const ref = (await only())?.providerRef ?? "";
    const first = await receivePaymentEventFromWebhook(event("succeeded", ref), SIGNATURE);
    const second = await receivePaymentEventFromWebhook(event("succeeded", ref), SIGNATURE);
    expect(first).toEqual(second);
    expect((await only())?.status).toBe("succeeded");
  });

  it("never moves an attempt backwards on an out-of-order event", async () => {
    await startPayment(ORDER, 1000);
    const ref = (await only())?.providerRef ?? "";
    await receivePaymentEventFromWebhook(event("succeeded", ref), SIGNATURE);
    await receivePaymentEventFromWebhook(event("processing", ref), SIGNATURE);
    expect((await only())?.status).toBe("succeeded");
  });

  it("records a refund when success arrives after a cancel", async () => {
    await startPayment(ORDER, 1000);
    const ref = (await only())?.providerRef ?? "";
    await recordCancellation(ORDER);
    await receivePaymentEventFromWebhook(event("succeeded", ref), SIGNATURE);
    expect((await only())?.status).toBe("refund_pending");
  });

  it("ignores an event for an unknown payment", async () => {
    expect(
      await receivePaymentEventFromWebhook(event("succeeded", "pi_unknown"), SIGNATURE),
    ).toEqual({
      ok: true,
      value: null,
    });
  });
});
