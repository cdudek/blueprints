import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/db", () => import("@tests/helpers/db-mock").then((m) => m.dbModule()));

const call = (authorization?: string) =>
  POST(
    new Request("http://localhost/api/cron/payments", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );

afterEach(() => vi.unstubAllEnvs());

describe("payments cron route", () => {
  it("is off until a secret is configured", async () => {
    expect((await call()).status).toBe(503);
  });

  it("rejects a missing or wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
  });

  it("runs the job with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const response = await call("Bearer s3cret-value");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 0, failed: 0 });
  });
});
