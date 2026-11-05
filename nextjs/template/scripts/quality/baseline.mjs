// Per-violation baselines, shared by the architecture, knip and jscpd gates.
// A baseline is { "entries": [ "<stable key>", ... ] }. It may only shrink:
//   - a violation not in the baseline fails the gate,
//   - a baseline entry that no longer occurs fails the gate (delete the line),
//   - a pull request that adds a line to a baseline fails (baseline-shrinks.mjs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} path @returns {string[]} */
export function readBaseline(path) {
  if (!existsSync(path)) return [];
  const { entries } = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(entries) ? entries : [];
}

/** @param {string} path @param {string[]} entries */
export function writeBaseline(path, entries) {
  writeFileSync(path, `${JSON.stringify({ entries: [...new Set(entries)].sort() }, null, 2)}\n`);
}

/**
 * @param {string[]} current keys found now
 * @param {string[]} baseline keys the baseline accepts
 * @returns {{ added: string[], stale: string[] }} added: new violations; stale: baseline lines to delete
 */
export function compareToBaseline(current, baseline) {
  const known = new Set(baseline);
  const now = new Set(current);
  return {
    added: [...now].filter((k) => !known.has(k)).sort(),
    stale: [...known].filter((k) => !now.has(k)).sort(),
  };
}

/** Lines a baseline gained against its previous version. @param {string[]} before @param {string[]} after */
export function gainedEntries(before, after) {
  const old = new Set(before);
  return after.filter((k) => !old.has(k)).sort();
}

/** Name of the gate in output, the keys found now, the baseline file. Returns the exit code. */
export function ratchet(name, current, baselinePath) {
  const { added, stale } = compareToBaseline(current, readBaseline(baselinePath));
  for (const key of added) console.error(`${name}: NEW   ${key}`);
  for (const key of stale)
    console.error(`${name}: STALE ${key} (fixed: delete this line from ${baselinePath})`);
  if (added.length)
    console.error(
      `${name}: ${added.length} new finding(s). Fix them; never add a line to the baseline in a feature PR.`,
    );
  if (stale.length) console.error(`${name}: ${stale.length} stale baseline line(s).`);
  console.log(
    `${name}: ${current.length} finding(s), ${readBaseline(baselinePath).length} baselined, ${added.length} new, ${stale.length} stale`,
  );
  return added.length || stale.length ? 1 : 0;
}

/** Absolute path of a package's bin script, resolved from this repo's node_modules. */
export function binOf(pkg, bin = pkg) {
  // top-level node_modules of this project (pnpm links direct dependencies there)
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../node_modules", pkg);
  const { bin: b } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return join(dir, typeof b === "string" ? b : b[bin]);
}

/** Reads `--name value` from argv. */
export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** An analyzer that crashed or wrote garbage is a failure, never a pass. */
export function fatal(message) {
  console.error(`ANALYZER ERROR: ${message}`);
  process.exit(2);
}

/**
 * Stable occurrence identity: the n-th identical key becomes `key#n`. A second occurrence of the
 * same finding is therefore a NEW entry (multiplicity is preserved), and fixing one leaves the
 * other lines untouched. @param {string[]} keys
 */
export function numbered(keys) {
  const seen = new Map();
  return [...keys].sort().map((k) => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${k}#${n}`;
  });
}

/** quality/baseline-renames.json: reviewed file moves, applied to the base before comparing. */
export function readRenames(path = "quality/baseline-renames.json") {
  if (!existsSync(path)) return [];
  const { renames } = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(renames) ? renames : [];
}

/** @param {string[]} entries @param {{ from: string, to: string }[]} renames */
export function applyRenames(entries, renames) {
  return entries.map((e) => renames.reduce((acc, r) => acc.split(r.from).join(r.to), e));
}
