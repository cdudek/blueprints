// A baseline may only shrink. Compares each baseline, and the reviewed jscpd exceptions, with its
// version at the merge base of this branch and the target branch. Any added line fails.
// - A file absent at the merge base is being adopted (brownfield step 2): it passes, and from the
//   next PR on it may only lose lines.
// - A file that does not parse, or a git error, fails closed: an unreadable baseline is not a pass.
// - A rename recorded in quality/baseline-renames.json moves lines only when its source existed
//   at the merge base and its destination did not (a split that keeps the source counts too).
// The target branch: BASELINE_BASE_REF, else origin/main.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { baseRef, gainedAfterRenames, readRenames } from "./baseline.mjs";

const files = [
  "quality/arch-baseline.json",
  "quality/knip-baseline.json",
  "quality/jscpd-baseline.json",
  "quality/jscpd-exceptions.json",
];
const git = (/** @type {string[]} */ ...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const entriesOf = (/** @type {string} */ file, /** @type {any} */ data) =>
  file.endsWith("jscpd-exceptions.json")
    ? (data.exceptions ?? []).map((/** @type {{ fingerprint: string }} */ e) => e.fingerprint)
    : (data.entries ?? []);

/** Only a new destination inherits findings; a rename that cannot be checked is ignored. */
function verifiedRenames(/** @type {string} */ base) {
  return readRenames().filter(({ from, to }) => {
    let reason = "";
    if (typeof from !== "string" || typeof to !== "string" || !from.trim() || !to.trim())
      reason = "rename paths must be non-empty strings";
    else if (!git("ls-tree", "--name-only", base, "--", from))
      reason = "the source did not exist at the merge base";
    else if (git("ls-tree", "--name-only", base, "--", to))
      reason = "the destination existed at the merge base";
    else if (!existsSync(to)) reason = "the destination does not exist";
    if (reason) console.log(`baseline-shrinks: ignored rename ${from} -> ${to}: ${reason}`);
    return !reason;
  });
}

try {
  const ref = baseRef();
  let base;
  try {
    base = git("merge-base", "HEAD", ref);
  } catch (error) {
    if (process.env.CI || process.env.BASELINE_BASE_REF) {
      console.error(
        `baseline-shrinks: cannot find a merge base with ${ref} (shallow clone?). Failing closed. ${error.message}`,
      );
      process.exit(2);
    }
    console.log(`baseline-shrinks: no ${ref} to compare with; skipped (CI always compares)`);
    process.exit(0);
  }
  console.log(`baseline-shrinks: comparing with ${ref} (merge base ${base.slice(0, 7)})`);

  const renames = verifiedRenames(base);
  // a rename whose source still exists is a split: the source keeps some lines, the destination gets the rest
  const splits = renames.filter((r) => existsSync(r.from));
  const moves = renames.filter((r) => !existsSync(r.from));
  let failed = false;
  for (const file of files) {
    const current = existsSync(file) ? entriesOf(file, JSON.parse(readFileSync(file, "utf8"))) : [];
    // only a successful, empty tree listing means absent; a git error throws and fails closed
    if (!git("ls-tree", "--name-only", base, "--", file)) {
      console.log(`baseline-shrinks: ${file} adopted with ${current.length} entries`);
      continue;
    }
    const before = entriesOf(file, JSON.parse(git("show", `${base}:./${file}`)));
    const gained = gainedAfterRenames(before, current, moves, splits);
    for (const key of gained) console.error(`baseline-shrinks: ${file} gained ${key}`);
    if (gained.length) failed = true;
  }
  console.log(
    failed ? "baseline-shrinks: FAILED, baselines may only shrink" : "baseline-shrinks: ok",
  );
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error(`baseline-shrinks: cannot compare baselines, failing closed: ${error.message}`);
  process.exit(2);
}
