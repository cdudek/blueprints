// knip as a ratchet: every finding is keyed `file:type:name`; findings not in
// quality/knip-baseline.json fail, and baseline lines that no longer occur fail.
// Usage: node scripts/quality/knip-ratchet.mjs [--cwd <dir>] [--baseline <file>]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { arg, binOf, fatal, ratchet } from "./baseline.mjs";

const cwd = resolve(arg("cwd", "."));
const baseline = resolve(cwd, arg("baseline", "quality/knip-baseline.json"));

const run = spawnSync(process.execPath, [binOf("knip"), "--reporter", "json", "--no-progress"], {
  cwd,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
// knip exits 1 when it has findings; anything else non-zero means it did not run properly.
if (run.error || ![0, 1].includes(run.status ?? -1))
  fatal(`knip exited ${run.status}: ${run.stderr || run.error}`);

/** @type {{ issues?: Record<string, unknown>[] }} */
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  fatal(`knip did not print JSON: ${run.stdout.slice(0, 200)} ${run.stderr.slice(0, 200)}`);
}
if (!Array.isArray(report.issues)) fatal("knip report has no `issues` array");

const keys = new Set();
for (const issue of report.issues) {
  const file = String(issue.file);
  for (const [type, items] of Object.entries(issue)) {
    if (type === "file" || !Array.isArray(items)) continue;
    for (const item of items) {
      const name = typeof item === "string" ? item : (item.name ?? (item.names ?? []).join(","));
      keys.add(`${file}:${type}:${name}`);
    }
  }
}

process.exit(ratchet("knip", [...keys], baseline));
