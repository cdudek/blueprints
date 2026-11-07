// Shared helpers for the architecture tooling. Plain JS so ESLint's config can import it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The version of these scripts and of the policy schema they read. See CHANGELOG.md. */
export const BLUEPRINT_VERSION = "1.0.0";

/**
 * @typedef {{ from: string, to: string, reason: string }} Edge
 * @typedef {{ file: string, table: string, reason: string }} ReadException
 * @typedef {{ path: string, rules: string[], reason: string }} Exemption
 * @typedef {{
 *   app?: string, modules?: string, ui?: string, shared?: string, db?: string, clients?: string,
 *   dbClient?: string, schemaRoot?: string, serverShared?: string[], resultFile?: string,
 * }} LayoutBlock
 * @typedef {{
 *   $schemaVersion: string,
 *   version: 1,
 *   srcRoot: string,
 *   layout?: LayoutBlock,
 *   doors: Record<string, "browser" | "server">,
 *   roots: string[],
 *   modules: Record<string, { description: string }>,
 *   edges: Edge[],
 *   tables: Record<string, string>,
 *   readExceptions: ReadException[],
 *   exemptions: Exemption[],
 *   clients: string[],
 *   serverOnlyPackages: string[],
 *   rulesMayImport: string[],
 * }} Architecture
 */

/** @param {string} root @returns {Architecture} */
export function loadArchitecture(root = process.cwd()) {
  const arch = JSON.parse(readFileSync(join(root, "architecture.json"), "utf8"));
  if (String(arch.$schemaVersion).split(".")[0] !== BLUEPRINT_VERSION.split(".")[0]) {
    throw new Error(
      `architecture.json is for blueprint ${arch.$schemaVersion}, these scripts are ${BLUEPRINT_VERSION}: migrate per CHANGELOG.md`,
    );
  }
  return arch;
}

/** @param {Architecture} arch */
export const moduleNames = (arch) => Object.keys(arch.modules);

/** Modules `name` may depend on, from the declared edges. @param {Architecture} arch @param {string} name */
export const allowedTargets = (arch, name) =>
  arch.edges.filter((e) => e.from === name).map((e) => e.to);

/**
 * Where each folder of the blueprint lives, relative to srcRoot. The optional `layout` block of
 * architecture.json overrides any key; a key left out keeps the 1.0.0 path.
 * @param {Architecture} arch @returns {Required<LayoutBlock>}
 */
export function layoutOf(arch) {
  const l = arch.layout ?? {};
  return {
    app: l.app ?? "app",
    modules: l.modules ?? "modules",
    ui: l.ui ?? "ui",
    shared: l.shared ?? "shared",
    db: l.db ?? "db",
    clients: l.clients ?? "clients",
    /** the database client: the one transaction gateway */
    dbClient: l.dbClient ?? "db/index.ts",
    /** the persistence composition root */
    schemaRoot: l.schemaRoot ?? "db/schema.ts",
    /** shared files that are server-only */
    serverShared: l.serverShared ?? ["shared/auth.ts", "shared/env.ts", "shared/access.ts"],
    /** the one shared file a rules file may import: the Result type */
    resultFile: l.resultFile ?? "shared/result.ts",
  };
}

/** The module a file path belongs to (<srcRoot>/<modules>/<name>/...), or null. @param {Architecture} arch @param {string} file */
export const moduleOf = (arch, file) =>
  new RegExp(`(?:^|/)${arch.srcRoot}/${layoutOf(arch).modules}/([^/]+)/`).exec(file)?.[1] ?? null;

/** Door file names, optionally of one role. @param {Architecture} arch @param {"browser" | "server"} [role] */
export const doorFiles = (arch, role) =>
  Object.entries(arch.doors)
    .filter(([, r]) => !role || r === role)
    .map(([file]) => file);

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
