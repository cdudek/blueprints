// Starts src/worker.ts with plain Node: `pnpm worker`, or `pnpm worker:check` to install the queue
// schema and exit (CI and the deploy run it to prove the worker starts).
import "./worker-hooks.mjs";

const { startWorker } = await import("../src/worker.ts");
await startWorker({ check: process.argv.includes("--check") });
