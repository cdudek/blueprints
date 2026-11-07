import "server-only";
import { parseCronItems, run, runMigrations, type TaskList } from "graphile-worker";
import { processPaymentWorkFromJob } from "@/modules/billing/server";
import { getEnv } from "@/shared/env";

// The background process: a Postgres queue (graphile-worker) in its own process. Each task calls
// one job operation through a server door; the business logic stays in the module.

const log = (level: "info" | "error", message: string, fields: object = {}) =>
  console.log(JSON.stringify({ level, message, ...fields }));

export const taskList: TaskList = {
  "payments-work": async () => {
    const result = await processPaymentWorkFromJob(new Date());
    log("info", "payments-work", result.ok ? result.value : { error: result.error });
  },
};

// Every minute. The stable job key keeps one pending copy however many workers schedule it, and
// the queue runs the copies one at a time. Each provider call inside carries its own idempotency
// key (billing), so a job that still runs twice cannot cancel or refund twice.
export const cronItems = parseCronItems([
  {
    task: "payments-work",
    match: "* * * * *",
    identifier: "payments-work",
    options: { jobKey: "payments-work", queueName: "payments", backfillPeriod: 0 },
  },
]);

/** `check`: install or upgrade the queue schema and exit, so a deploy can prove the worker starts. */
export async function startWorker({ check = false } = {}) {
  const connectionString = getEnv().DATABASE_URL;
  if (check) {
    await runMigrations({ connectionString });
    log("info", "worker check passed", { tasks: Object.keys(taskList), cron: cronItems.length });
    return;
  }
  const runner = await run({
    connectionString,
    concurrency: 2,
    taskList,
    parsedCronItems: cronItems,
  });
  log("info", "worker started", { tasks: Object.keys(taskList) });
  await runner.promise; // graphile-worker stops gracefully on SIGTERM and SIGINT
}
