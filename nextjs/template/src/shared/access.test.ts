import { describe, expect, it, vi } from "vitest";
import * as accounts from "@/modules/accounts/server";
import * as billing from "@/modules/billing/server";
import * as orders from "@/modules/orders/server";
import { policyOf } from "./access";

vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));

const doors = { accounts, billing, orders };
const exported = Object.entries(doors).flatMap(([module, door]) =>
  Object.entries(door).map(([name, fn]) => ({ id: `${module}.${name}`, fn })),
);

describe("every operation a server door exports declares an access policy", () => {
  it.each(exported)("$id", ({ fn }) => {
    const policy = policyOf(fn);
    expect(policy, "wrap it in operation({ access: ... }, ...)").toBeDefined();
    if (policy?.access === "public") {
      expect(policy.validation.length).toBeGreaterThan(5);
      expect(policy.abuseControls.length).toBeGreaterThan(5);
    }
    if (policy?.access === "user") expect(policy.resource.length).toBeGreaterThan(5);
    if (policy?.access === "webhook") expect(policy.verifiedBy.length).toBeGreaterThan(5);
    if (policy?.access === "job") expect(policy.triggeredBy.length).toBeGreaterThan(5);
  });
});

describe("user operations refuse an anonymous caller with a typed error", () => {
  const userOps = exported.filter(({ fn }) => policyOf(fn)?.access === "user");

  it("finds user operations to check", () => {
    expect(userOps.length).toBeGreaterThan(2);
  });

  it.each(userOps)("$id", async ({ fn }) => {
    const call = fn as (...args: unknown[]) => Promise<unknown>;
    expect(await call(null, {}, {})).toEqual({ ok: false, error: "unauthenticated" });
  });
});
