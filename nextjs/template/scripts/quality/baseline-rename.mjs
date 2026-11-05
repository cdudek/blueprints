// The reviewed procedure for moving or renaming a file that has baselined findings.
//   node scripts/quality/baseline-rename.mjs <old/path.ts> <new/path.ts>
// Rewrites the path in every baseline and records the move in quality/baseline-renames.json, so
// baseline-shrinks.mjs treats the renamed lines as moved, not added. Do it in the same commit
// as `git mv`, and expect the reviewers of the baselines to look at it.
import { writeFileSync } from "node:fs";
import { readBaseline, readRenames, writeBaseline } from "./baseline.mjs";

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: baseline-rename.mjs <old> <new>");
  process.exit(2);
}
for (const file of ["arch", "knip", "jscpd"].map((n) => `quality/${n}-baseline.json`)) {
  writeBaseline(
    file,
    readBaseline(file).map((e) => e.split(from).join(to)),
  );
}
const renames = [...readRenames(), { from, to }];
writeFileSync("quality/baseline-renames.json", `${JSON.stringify({ renames }, null, 2)}\n`);
console.log(`recorded rename ${from} -> ${to}; review quality/*.json together`);
