// Writes quality/arch-baseline.json from today's findings. Only for adopting the blueprint
// (brownfield step 2) and for a reviewed tool upgrade; after that a PR may only delete lines
// (pnpm arch:baseline). A finding of a never-baselinable rule (server code or secrets in a
// browser bundle) is never written: it is listed and the command fails, because a leak is not
// migration debt. Diagnostics never fail, so they are not written either.
// Usage: pnpm arch:baseline:write [--tsconfig <file>]   (from the project root)
import { resolve } from "node:path";
import { loadArchitecture } from "../arch/lib.mjs";
import { buildRules, findingKeys, runAll } from "../../tests/architecture/rules.ts";
import { arg, writeBaseline } from "./baseline.mjs";

const root = process.cwd();
const arch = loadArchitecture(root);
const rules = buildRules(arch);
const tsconfig = resolve(root, arg("tsconfig", "tsconfig.arch.json"));
const findings = await runAll({ arch, tsconfig, root });
const never = new Set(rules.filter((r) => r.neverBaseline).map((r) => r.id));
const diagnostic = new Set(rules.filter((r) => r.severity === "diagnostic").map((r) => r.id));

const leaks = findings.filter((f) => never.has(f.rule));
const keep = findings.filter((f) => !never.has(f.rule) && !diagnostic.has(f.rule));
writeBaseline("quality/arch-baseline.json", findingKeys(keep));
console.log(`quality/arch-baseline.json: ${keep.length} entries`);
if (leaks.length) {
  for (const f of leaks)
    console.error(`NEVER BASELINED ${f.rule} ${f.file} ${f.target}: ${f.message}`);
  console.error(
    `${leaks.length} finding(s) of never-baselinable rules: fix them, they cannot be frozen`,
  );
  process.exit(1);
}
