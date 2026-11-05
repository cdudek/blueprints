// A baseline may only shrink. Compares each baseline file with its version at the merge base
// of this branch and BASELINE_BASE_REF (default origin/main). Any added line fails.
// Greenfield: baselines are empty, so any line added to one is a new violation sneaking in.
// Brownfield: the initial baseline commit is made on the base branch; PRs may only delete lines.
import { execFileSync } from "node:child_process";
import { applyRenames, gainedEntries, readBaseline, readRenames } from "./baseline.mjs";

const files = [
  "quality/arch-baseline.json",
  "quality/knip-baseline.json",
  "quality/jscpd-baseline.json",
];
const ref = process.env.BASELINE_BASE_REF || "origin/main";
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let base;
try {
  base = git("merge-base", "HEAD", ref);
} catch {
  if (process.env.CI) {
    console.error(
      `baseline-shrinks: cannot find a merge base with ${ref} in CI (shallow clone?). Failing closed.`,
    );
    process.exit(2);
  }
  console.log(`baseline-shrinks: no ${ref} to compare with; skipped (CI always compares)`);
  process.exit(0);
}

let failed = false;
for (const file of files) {
  let before = [];
  try {
    const old = JSON.parse(git("show", `${base}:./${file}`));
    before = Array.isArray(old.entries) ? old.entries : [];
  } catch {
    // the file did not exist at the merge base: every entry is new
  }
  // a reviewed rename (quality/baseline-renames.json) moves an entry; it is not an addition
  const gained = gainedEntries(applyRenames(before, readRenames()), readBaseline(file));
  for (const key of gained) console.error(`baseline-shrinks: ${file} gained ${key}`);
  if (gained.length) failed = true;
}
console.log(
  failed ? "baseline-shrinks: FAILED, baselines may only shrink" : "baseline-shrinks: ok",
);
process.exit(failed ? 1 : 0);
