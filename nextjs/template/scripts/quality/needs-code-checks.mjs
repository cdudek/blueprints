// CI's path filter: only a change made entirely of prose skips the heavy jobs. The generated
// diagram (docs/architecture.md) is read by `pnpm arch`, and quality/ and the policy files are
// read by the gates, so a change to them is never docs-only. An empty list runs everything.
// Usage: git diff --name-only <base>...HEAD | node scripts/quality/needs-code-checks.mjs  -> true | false
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const prose = /(\.md$|^docs\/|^LICENSE$)/;
const readByChecks = /^(docs\/architecture\.md|quality\/.*|architecture(\.schema)?\.json)$/;

/** @param {string[]} paths */
export const needsCodeChecks = (paths) =>
  paths.length === 0 || paths.some((p) => readByChecks.test(p) || !prose.test(p));

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const paths = readFileSync(0, "utf8").split("\n").filter(Boolean);
  console.log(String(needsCodeChecks(paths)));
}
