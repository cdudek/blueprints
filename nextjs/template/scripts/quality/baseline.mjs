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

/**
 * Rewrites whole path fields, never substrings, so renaming `a.ts` leaves `data.ts` alone.
 * Keys: architecture `rule|file|target#n`, knip `file:type:name`, jscpd `file:file:hash#n`.
 * @param {string[]} entries @param {{ from: string, to: string }[]} renames
 */
export function applyRenames(entries, renames) {
  for (const { from, to } of renames)
    if (typeof from !== "string" || typeof to !== "string" || !from.trim() || !to.trim())
      throw new Error("rename paths must be non-empty strings");
  return entries.map((entry) =>
    renames.reduce((key, { from, to }) => {
      const delimiter = key.includes("|") ? "|" : ":";
      const fields = key.split(delimiter);
      const clone = delimiter === ":" && /^[0-9a-f]{12}(#\d+)?$/.test(fields[2] ?? "");
      const unusedFile = delimiter === ":" && fields[1] === "files" && fields[0] === from;
      const pathFields = delimiter === "|" ? [1, 2] : clone ? [0, 1] : unusedFile ? [0, 2] : [0];
      for (const i of pathFields) {
        const field = fields[i] ?? "";
        if (field === from) fields[i] = to;
        // an architecture target that is a file keeps its #n suffix
        else if (delimiter === "|" && i === 2 && field.replace(/#\d+$/, "") === from)
          fields[i] = `${to}${field.slice(from.length)}`;
      }
      // a clone's two files stay sorted, as the ratchet writes them
      if (clone) [fields[0], fields[1]] = [fields[0] ?? "", fields[1] ?? ""].sort();
      return fields.join(delimiter);
    }, entry),
  );
}

/**
 * Lines `after` gained against `before`, once reviewed renames are applied. A move rewrites the
 * line; a split (its source file still exists) lets each line stay or move, but only once, so
 * copying a finding into both files is still a gain.
 * @param {string[]} before @param {string[]} after
 * @param {{ from: string, to: string }[]} moves @param {{ from: string, to: string }[]} splits
 */
export function gainedAfterRenames(before, after, moves, splits = []) {
  const available = new Set(applyRenames(before, moves));
  /** @type {Map<string, string>} the split form of a line -> the line */
  const moved = new Map();
  for (const line of available) {
    const [to] = applyRenames([line], splits);
    if (to && to !== line) moved.set(to, line);
  }
  return after
    .filter((key) => {
      const line = available.has(key) ? key : moved.get(key);
      if (line === undefined || !available.has(line)) return true;
      available.delete(line);
      return false;
    })
    .sort();
}

/**
 * The branch a baseline is compared with: BASELINE_BASE_REF, else the remote's default branch
 * (origin/HEAD), else origin/main. @param {(...args: string[]) => string} git
 */
export function baseRef(git) {
  if (process.env.BASELINE_BASE_REF) return process.env.BASELINE_BASE_REF;
  try {
    return git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").trim() || "origin/main";
  } catch {
    return "origin/main"; // no origin/HEAD (a fresh clone sets it; `git remote set-head origin -a` does too)
  }
}
