import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { layoutOf, loadArchitecture } from "../../scripts/arch/lib.mjs";
import { policyOf } from "./access";

vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));

// Every server door the policy declares, so a module added tomorrow is checked without editing
// this file. A module whose server door is missing fails here and in modules-declared.
const root = resolve(__dirname, "../..");
const arch = loadArchitecture(root);
const serverDoor = Object.entries(arch.doors).find(([, role]) => role === "server")?.[0];
const doors = await Promise.all(
  Object.keys(arch.modules).map(async (module) => ({
    module,
    door: (await import(
      resolve(root, arch.srcRoot, layoutOf(arch).modules, module, serverDoor ?? "server.ts")
    )) as Record<string, unknown>,
  })),
);
const exported = doors.flatMap(({ module, door }) =>
  Object.entries(door).map(([name, fn]) => ({ id: `${module}.${name}`, fn })),
);

describe("the policy's server doors", () => {
  it("are all loaded", () => {
    expect(doors.map((d) => d.module)).toEqual(Object.keys(arch.modules));
    expect(exported.length).toBeGreaterThan(0);
  });
});

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
