// Flags, together, every change that loosens or moves the goalposts: the policy file, its schema,
// tool exclusions and configs, baselines, and newly added suppression comments. Informational:
// it never fails; CI prints it so a reviewer sees it in one place.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { baseRef } from "./baseline.mjs";

const guarded = [
  "architecture.json",
  "architecture.schema.json",
  "tsconfig.arch.json",
  "knip.json",
  ".jscpd.json",
  "eslint.config.mjs",
  "quality/arch-baseline.json",
  "quality/knip-baseline.json",
  "quality/jscpd-baseline.json",
  "quality/jscpd-exceptions.json",
  "quality/baseline-renames.json",
];
const suppressions =
  /eslint-disable|@ts-ignore|@ts-expect-error|knip-ignore|@public|istanbul ignore/;
const git = (/** @type {string[]} */ ...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024, // a large PR must not turn an informational step red
    stdio: ["ignore", "pipe", "pipe"],
  });

try {
  const ref = baseRef();
  let base;
  try {
    base = git("merge-base", "HEAD", ref).trim();
  } catch {
    console.log(`policy-changes: no ${ref} to compare with; nothing to report`);
    process.exit(0);
  }

  const lines = [];
  const changed = git("diff", "--name-only", base, "--", ".").split("\n").filter(Boolean);
  const root = git("rev-parse", "--show-prefix").trim();
  for (const file of guarded)
    if (changed.includes(`${root}${file}`)) lines.push(`changed: ${file}`);
  const added = git(
    "diff",
    "-U0",
    base,
    "--",
    ".",
    ":(exclude)tests/fixtures",
    ":(exclude)pnpm-lock.yaml",
  )
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++") && suppressions.test(l));
  for (const l of added) lines.push(`suppression added: ${l.slice(1).trim()}`);

  if (!lines.length) {
    console.log("policy-changes: no policy, exclusion, suppression or baseline changes");
  } else {
    const report = ["### Governance changes in this branch", ...lines.map((l) => `- ${l}`)].join(
      "\n",
    );
    console.log(report);
    for (const l of lines) console.log(`::warning title=governance::${l}`);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
} catch (error) {
  // informational: it never fails the build, it says why it has nothing to show
  console.error(`policy-changes: report unavailable: ${error.message}`);
}
