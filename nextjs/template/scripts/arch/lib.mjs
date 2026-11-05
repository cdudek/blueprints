// Shared helpers for the architecture tooling. Plain JS so ESLint's config can import it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {{ from: string, to: string, reason: string }} Edge
 * @typedef {{ reader: string, table: string, reason: string }} ReadException
 * @typedef {{ path: string, rules: string[], reason: string }} Exemption
 * @typedef {{
 *   version: 1,
 *   srcRoot: string,
 *   doors: string[],
 *   modules: Record<string, { description: string }>,
 *   edges: Edge[],
 *   tables: Record<string, string>,
 *   readExceptions: ReadException[],
 *   exemptions: Exemption[],
 *   clients: string[],
 * }} Architecture
 */

/** @param {string} root @returns {Architecture} */
export function loadArchitecture(root = process.cwd()) {
  return JSON.parse(readFileSync(join(root, "architecture.json"), "utf8"));
}

/** @param {Architecture} arch */
export const moduleNames = (arch) => Object.keys(arch.modules);

/** Modules `name` may depend on, from the declared edges. @param {Architecture} arch @param {string} name */
export const allowedTargets = (arch, name) =>
  arch.edges.filter((e) => e.from === name).map((e) => e.to);

/** Modules whose tables `name` may read: its declared read exceptions. */
export const tableOwnersReadBy = (/** @type {Architecture} */ arch, /** @type {string} */ name) => [
  ...new Set(
    arch.readExceptions
      .filter((x) => x.reader === name)
      .map((x) => arch.tables[x.table])
      .filter((owner) => owner !== undefined),
  ),
];

/** Finds a cycle in the declared edges, or null. @param {Architecture} arch */
export function findEdgeCycle(arch) {
  /** @type {Map<string, number>} 0 = in progress, 1 = done */
  const state = new Map();
  /** @param {string} node @param {string[]} stack @returns {string[] | null} */
  const visit = (node, stack) => {
    if (state.get(node) === 1) return null;
    if (state.get(node) === 0) return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 0);
    for (const next of allowedTargets(arch, node)) {
      const cycle = visit(next, [...stack, node]);
      if (cycle) return cycle;
    }
    state.set(node, 1);
    return null;
  };
  for (const name of moduleNames(arch)) {
    const cycle = visit(name, []);
    if (cycle) return cycle;
  }
  return null;
}

/** `**` crosses folders, `*` does not. Enough for the policy file's path globs. @param {string} glob */
export function globToRegExp(glob) {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "@@DIRS@@")
    .replace(/\*\*/g, "@@ANY@@")
    .replace(/\*/g, "[^/]*")
    .replace(/@@DIRS@@/g, "(?:.*/)?")
    .replace(/@@ANY@@/g, ".*");
  return new RegExp(`^${source}$`);
}
