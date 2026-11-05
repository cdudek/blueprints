import { timingSafeEqual } from "node:crypto";
import { processPaymentWorkFromJob } from "@/modules/billing/server";
import { getEnv } from "@/shared/env";

// The scheduler entry point for billing's cancel and refund work. It is the only caller of a
// job operation, and it authenticates the scheduler with a shared secret first.
export async function POST(req: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return new Response("cron is not configured", { status: 503 });

  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return new Response("unauthorized", { status: 401 });
  }

  const result = await processPaymentWorkFromJob(new Date());
  return Response.json(result.ok ? result.value : { error: result.error });
}
