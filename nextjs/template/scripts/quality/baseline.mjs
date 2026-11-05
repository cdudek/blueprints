// Per-violation baselines, shared by the architecture, knip and jscpd gates.
// A baseline is { "entries": [ "<stable key>", ... ] }. It may only shrink:
//   - a violation not in the baseline fails the gate,
//   - a baseline entry that no longer occurs fails the gate (delete the line),
//   - a pull request that adds a line to a baseline fails (baseline-shrinks.mjs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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
