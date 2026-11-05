import { describe, expect, it, vi } from "vitest";
import * as billing from "@/modules/billing/server";
import * as orders from "@/modules/orders/server";
import { policyOf } from "./access";
import { signInAs } from "@tests/helpers/auth-mock";

vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));
vi.mock("@/shared/auth", () => import("@tests/helpers/auth-mock").then((m) => m.authMock));

const doors = { billing, orders };
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
    signInAs(null);
    const call = fn as (...args: unknown[]) => Promise<unknown>;
    expect(await call({}, {})).toEqual({ ok: false, error: "unauthenticated" });
  });
});
