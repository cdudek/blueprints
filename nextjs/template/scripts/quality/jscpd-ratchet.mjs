// jscpd as a ratchet. A clone is keyed by its two files plus a hash of the duplicated text,
// not by line numbers, so edits elsewhere in a file do not churn the key.
// Rule: no new duplication above the threshold in .jscpd.json. Extract only when the two copies
// change for the same reason; otherwise rename or restructure them so they stop matching.
// Usage: node scripts/quality/jscpd-ratchet.mjs [--cwd <dir>] [--baseline <file>]
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { arg, binOf, fatal, numbered, ratchet } from "./baseline.mjs";

const cwd = resolve(arg("cwd", "."));
const baseline = resolve(cwd, arg("baseline", "quality/jscpd-baseline.json"));
const reportFile = join(cwd, "reports/jscpd/jscpd-report.json");
rmSync(reportFile, { force: true }); // never judge a stale report

const run = spawnSync(process.execPath, [binOf("jscpd")], {
  cwd,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (run.error || run.status !== 0) fatal(`jscpd exited ${run.status}: ${run.stderr || run.error}`);
if (!existsSync(reportFile)) fatal(`jscpd wrote no report at ${reportFile}`);

/** @type {{ duplicates?: { fragment?: string, firstFile?: { name: string }, secondFile?: { name: string } }[] }} */
let report;
try {
  report = JSON.parse(readFileSync(reportFile, "utf8"));
} catch {
  fatal("jscpd report is not valid JSON");
}
if (!Array.isArray(report.duplicates)) fatal("jscpd report has no `duplicates` array");

const found = report.duplicates.map((d) => {
  if (!d.firstFile || !d.secondFile || typeof d.fragment !== "string")
    fatal("jscpd report has a malformed clone");
  const files = [d.firstFile.name, d.secondFile.name].sort().join(":");
  const hash = createHash("sha1")
    .update(d.fragment.replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 12);
  return `${files}:${hash}`;
});

// Reviewed, intentional duplication: quality/jscpd-exceptions.json lists fingerprints with a reason.
// An exception that no longer matches a clone is stale and fails, like a baseline line.
const exceptionsFile = resolve(cwd, "quality/jscpd-exceptions.json");
const exceptions = existsSync(exceptionsFile)
  ? (JSON.parse(readFileSync(exceptionsFile, "utf8")).exceptions ?? [])
  : [];
for (const e of exceptions)
  if (typeof e.reason !== "string" || e.reason.length < 20)
    fatal(`exception ${e.fingerprint} needs a reason of at least 20 characters`);
const excepted = new Set(exceptions.map((e) => e.fingerprint));
const stale = [...excepted].filter((f) => !found.includes(f));
for (const f of stale)
  console.error(
    `jscpd: STALE exception ${f} (the clone is gone: delete it from quality/jscpd-exceptions.json)`,
  );

const code = ratchet("jscpd", numbered(found.filter((f) => !excepted.has(f))), baseline);
process.exit(code || (stale.length ? 1 : 0));
