// Every architecture rule, built at runtime from architecture.json: no generated code to commit.
// Rules are plain functions of a context (policy + tsconfig), so the same rules judge the real
// tree (architecture.test.ts) and the deliberate-violation fixtures (fixtures.test.ts).
//
// Three views of the code, because each has blind spots (the coverage matrix is in
// ARCHITECTURE.md section 13):
//   1. ArchUnitTS: precise folder-to-folder rules and cycles over top-level `import … from`.
//      It cannot see `export … from`, dynamic import() or node_modules.
//   2. A TypeScript-resolved graph (graph.ts): imports, re-exports, literal dynamic imports,
//      tsconfig paths, runtime vs erased type edges. Used for everything that needs the
//      transitive picture: cycles, what a client or a public door can reach, rules purity.
//   3. Syntax rules (`adhereTo` over the syntax tree): heuristics for what resolution cannot
//      decide: purity of globals, transaction discipline, access policies, door contents.
// eslint-plugin-boundaries (generated from the same file) gives editor feedback on dependencies.
import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { projectFiles, type FileInfo, type Violation } from "archunit";
import ts from "typescript";
import {
  allowedTargets,
  doorFiles,
  globToRegExp,
  layoutOf,
  moduleNames,
  moduleOf as moduleOfIn,
  type Architecture,
} from "../../scripts/arch/lib.mjs";
import {
  callsFunction,
  definedTables,
  hasDirective,
  identifiersIn,
  importedBindings,
  importsServerOnly,
  isValueReference,
  parse,
  specifiers,
  walk,
} from "./ast.ts";
import { buildGraph, cycles, reach, type Graph } from "./graph.ts";

export type Ctx = { arch: Architecture; tsconfig: string; root: string };
export type Finding = { rule: string; file: string; target: string; message: string };
export type ArchRule = {
  id: string;
  description: string;
  /** Number in ARCHITECTURE.md section 14. */
  nonNegotiable?: number;
  /**
   * Never admitted to a baseline, even in a brownfield repo: leaking server code or secrets into
   * a browser bundle cannot be "migration debt". Everything else may be frozen as debt.
   */
  neverBaseline?: boolean;
  /** `diagnostic` rules are heuristics: they are reported, they never fail the build. */
  severity?: "error" | "diagnostic";
  check: (ctx: Ctx) => Promise<Finding[]>;
};

const posix = (p: string) => p.split("\\").join("/");
const rel = (ctx: Ctx, p: string) => posix(isAbsolute(p) ? relative(ctx.root, p) : p);
// An empty selection is a failure, not a pass: a rule that matches no file proves nothing.
const OPTIONS = { allowEmptyTests: false };

type RawViolation = Violation & {
  dependency?: { sourceLabel: string; targetLabel: string };
  fileInfo?: { path: string };
  cycle?: { sourceLabel: string; targetLabel: string }[];
  message?: string;
  filters?: unknown;
};

function toFindings(ctx: Ctx, rule: string, message: string, violations: Violation[]): Finding[] {
  return (violations as RawViolation[]).flatMap((v) => {
    if (v.dependency)
      return [
        {
          rule,
          file: rel(ctx, v.dependency.sourceLabel),
          target: rel(ctx, v.dependency.targetLabel),
          message,
        },
      ];
    if (v.cycle) {
      const files = v.cycle.map((e) => rel(ctx, e.sourceLabel)).sort();
      return [{ rule, file: files[0] ?? "", target: files.join(" -> "), message }];
    }
    if (v.fileInfo) return [{ rule, file: rel(ctx, v.fileInfo.path), target: "", message }];
    // an EmptyTestViolation: the rule selected no file at all
    return [
      {
        rule,
        file: "",
        target: "empty-selection",
        message: `${message}: the rule's selection matched no file (${v.message ?? "empty"})`,
      },
    ];
  });
}

type Spec = { path: string; except?: string[] };
const spec = ({ path, except }: Spec) => [path, except?.length ? { except } : undefined] as const;

/**
 * Does the spec select any project file? A per-module or per-client rule whose selection is
 * legitimately empty (a module with no tables) is skipped; that existing things exist is asserted
 * separately (modules-declared, role coverage), so an empty selection never reads as a pass.
 */
function selects(ctx: Ctx, s: Spec): boolean {
  const include = globToRegExp(s.path);
  const exclude = (s.except ?? []).map(globToRegExp);
  return graphOf(ctx).files.some((f) => include.test(f) && !exclude.some((re) => re.test(f)));
}

/** `from` must not depend on `to` (ArchUnitTS, imports between project files). */
async function forbid(
  ctx: Ctx,
  rule: string,
  from: Spec,
  to: Spec,
  message: string,
): Promise<Finding[]> {
  if (!selects(ctx, from) || !selects(ctx, to)) return [];
  const violations = await projectFiles(ctx.tsconfig)
    .inPath(...spec(from))
    .shouldNot()
    .dependOnFiles()
    .inPath(...spec(to))
    .check(OPTIONS);
  return toFindings(ctx, rule, message, violations);
}

type Problem = { target: string; message: string };

/**
 * Runs `analyze` on the syntax tree of every file matching `from`. ArchUnitTS selects the files
 * but reads `file.content` relative to the process cwd, not the tsconfig folder, and silently
 * falls back to empty content when that fails. So we read the file ourselves, from ctx.root.
 */
async function content(
  ctx: Ctx,
  rule: string,
  from: Spec,
  analyze: (sf: ts.SourceFile, path: string, text: string) => Problem[],
): Promise<Finding[]> {
  if (!selects(ctx, from)) return [];
  const found: Finding[] = [];
  const violations = await projectFiles(ctx.tsconfig)
    .inPath(...spec(from))
    .should()
    .adhereTo((file: FileInfo) => {
      const path = rel(ctx, file.path);
      const text = readFileSync(join(ctx.root, path), "utf8");
      const problems = analyze(parse(path, text), path, text);
      for (const p of problems)
        found.push({ rule, file: path, target: p.target, message: p.message });
      return problems.length === 0;
    }, rule)
    .check(OPTIONS);
  // an empty selection is reported by the violations list, not by the condition
  return [
    ...found,
    ...toFindings(
      ctx,
      rule,
      rule,
      violations.filter((v) => !(v as RawViolation).fileInfo),
    ),
  ];
}

const graphs = new WeakMap<Ctx, Graph>();
const graphOf = (ctx: Ctx) => {
  let g = graphs.get(ctx);
  if (!g) graphs.set(ctx, (g = buildGraph(ctx.tsconfig, ctx.root)));
  return g;
};

const isBuiltin = (name: string) =>
  name.startsWith("node:") || builtinModules.includes(name.split("/")[0] ?? "");

export function buildRules(arch: Architecture): ArchRule[] {
  const src = arch.srcRoot;
  const L = layoutOf(arch);
  // every folder through the layout block: architecture.json may move any of them
  const at = (p: string) => `${src}/${p}`;
  const M = at(L.modules);
  const APP = at(L.app);
  const UI = at(L.ui);
  const SHARED = at(L.shared);
  const CLIENTS = at(L.clients);
  const moduleOf = (file: string) => moduleOfIn(arch, file);
  const modulePath = (name: string) => `${M}/${name}/**`;
  const modules = moduleNames(arch);
  const doorNames = doorFiles(arch);
  const serverDoorNames = doorFiles(arch, "server");
  const browserDoorNames = doorFiles(arch, "browser");
  const door = (m: string) => doorNames.map((d) => `${M}/${m}/${d}`);
  const db = `${at(L.db)}/**`;
  const sharedServer = L.serverShared.map(at);

  // ---- roles, by path ----
  const isServiceFile = (f: string) => /\.service\.ts$/.test(f);
  const isRoutes = (f: string) => new RegExp(`^${APP}/.*route\\.ts$`).test(f);
  const doorRole = (f: string) => {
    const m = new RegExp(`^${M}/[^/]+/([^/]+)$`).exec(f);
    return m && arch.doors[m[1] ?? ""];
  };
  const serverReason = (node: string, external: boolean): string | null => {
    if (external) {
      if (isBuiltin(node)) return "a Node builtin";
      return arch.serverOnlyPackages.some((p) => node === p || node.startsWith(`${p}/`))
        ? "a server-only package"
        : null;
    }
    if (/\.(service|repository|tables)\.ts$/.test(node))
      return "a service, repository or table file";
    if (node.startsWith(`${at(L.db)}/`)) return "the persistence layer";
    if (node.startsWith(`${CLIENTS}/`)) return "a third-party client";
    if (sharedServer.includes(node)) return "server-only shared code";
    if (doorRole(node) === "server") return "a server door";
    return null;
  };
  const publicEnv = (name: string) => name.startsWith("NEXT_PUBLIC_");

  /** What a bundle that includes `file` would carry: secrets read from the environment. */
  const envProblems = (sf: ts.SourceFile): Problem[] => {
    const out: Problem[] = [];
    walk(sf, (n) => {
      if (
        ts.isPropertyAccessExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "process" &&
        n.name.text === "env"
      ) {
        const outer = n.parent;
        const key =
          ts.isPropertyAccessExpression(outer) && outer.expression === n
            ? outer.name.text
            : ts.isElementAccessExpression(outer) &&
                ts.isStringLiteralLike(outer.argumentExpression)
              ? outer.argumentExpression.text
              : "*";
        if (!publicEnv(key))
          out.push({
            target: `process.env.${key}`,
            message: "a browser bundle must not read a non-public environment variable",
          });
      }
    });
    return out;
  };

  /** Walks the runtime closure of `roots`; every server-only thing it reaches is a finding. */
  const closure = (ctx: Ctx, rule: string, roots: string[], what: string): Finding[] => {
    const g = graphOf(ctx);
    const findings: Finding[] = [];
    for (const root of roots) {
      const own = serverReason(root, false);
      if (own) findings.push({ rule, file: root, target: root, message: `${what} is ${own}` });
    }
    // per root: a file reached from two roots is reported for each, with its own path
    const reachedAll = roots.flatMap((root) => reach(g, [root]));
    for (const r of reachedAll) {
      const reason = serverReason(r.node, r.external);
      if (reason)
        findings.push({
          rule,
          file: r.root,
          target: r.node,
          message: `${what} reaches ${reason}: ${r.path.join(" -> ")}`,
        });
    }
    const files = new Set([...roots, ...reachedAll.filter((r) => !r.external).map((r) => r.node)]);
    for (const f of files) {
      const sf = g.sources.get(f);
      if (sf)
        for (const p of envProblems(sf))
          findings.push({ rule, file: f, target: p.target, message: `${what}: ${p.message}` });
    }
    return findings;
  };

  const systemOps = (ctx: Ctx) => {
    const ops = new Map<string, Set<string>>();
    for (const [file, sf] of graphOf(ctx).sources) {
      const m = moduleOf(file);
      if (!m || !isServiceFile(file)) continue;
      for (const stmt of sf.statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        for (const d of stmt.declarationList.declarations) {
          const init = d.initializer;
          if (
            ts.isIdentifier(d.name) &&
            init &&
            ts.isCallExpression(init) &&
            ts.isIdentifier(init.expression) &&
            init.expression.text === "operation"
          ) {
            const access = accessOf(init);
            if (access === "webhook" || access === "job")
              (ops.get(m) ?? ops.set(m, new Set()).get(m)!).add(d.name.text);
          }
        }
      }
    }
    return ops;
  };
  const accessOf = (call: ts.CallExpression): string | null => {
    const [policy] = call.arguments;
    if (!policy || !ts.isObjectLiteralExpression(policy)) return null;
    for (const p of policy.properties) {
      if (
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === "access" &&
        ts.isStringLiteralLike(p.initializer)
      )
        return p.initializer.text;
    }
    return null;
  };

  return [
    // ---------------------------------------------------------------- structure
    {
      id: "modules-declared",
      description:
        "Every module folder is declared, has every door, and every declared module and client exists",
      nonNegotiable: 2,
      async check(ctx) {
        const declared = new Set(modules);
        const seen = new Set<string>();
        const findings = await content(
          ctx,
          "modules-declared",
          { path: `${M}/**` },
          (_sf, path) => {
            const name = moduleOf(path) ?? "";
            seen.add(name);
            return declared.has(name)
              ? []
              : [{ target: name, message: `module folder ${name} is not in architecture.json` }];
          },
        );
        const g = graphOf(ctx);
        const missing = [...declared].flatMap((m) => {
          if (!seen.has(m))
            return [
              {
                rule: "modules-declared",
                file: "architecture.json",
                target: m,
                message: `module ${m} has no files`,
              },
            ];
          return door(m)
            .filter((d) => !g.files.includes(d))
            .map((d) => ({
              rule: "modules-declared",
              file: d,
              target: d,
              message: `module ${m} is missing its door ${d}`,
            }));
        });
        const clients = arch.clients
          .filter((c) => !g.files.some((f) => f.startsWith(`${CLIENTS}/${c}/providers/`)))
          .map((c) => ({
            rule: "modules-declared",
            file: "architecture.json",
            target: `client:${c}`,
            message: `client ${c} has no providers/ folder`,
          }));
        // a role that selects no file would let every rule over it pass without checking anything
        const roles: Record<string, string> = {
          rules: `${src}/**/*.rules.ts`,
          service: `${src}/**/*.service.ts`,
          repository: `${src}/**/*.repository.ts`,
          tables: `${M}/*/*.tables.ts`,
          components: `${M}/*/components/**`,
        };
        const uncovered = Object.entries(roles)
          .filter(([, glob]) => !g.files.some((f) => globToRegExp(glob).test(f)))
          .map(([role, glob]) => ({
            rule: "modules-declared",
            file: "architecture.json",
            target: `role:${role}`,
            message: `the ${role} role (${glob}) selects no file: create one, or correct the layout`,
          }));
        return [...findings, ...missing, ...clients, ...uncovered];
      },
    },
    {
      id: "roots-classified",
      description:
        "Every production file sits in app, ui, shared, db, a declared module or client, or a declared root file",
      nonNegotiable: 2,
      async check(ctx) {
        const top1 = (p: string) => p.split("/")[0] ?? p;
        const known = new Set([L.app, L.ui, L.shared, L.db, L.modules, L.clients].map(top1));
        return graphOf(ctx).files.flatMap((f) => {
          const parts = f.slice(src.length + 1).split("/");
          const [top, second] = parts;
          const ok =
            parts.length === 1
              ? arch.roots.includes(top ?? "")
              : known.has(top ?? "") &&
                (top !== L.modules || modules.includes(second ?? "")) &&
                (top !== L.clients || arch.clients.includes(second ?? ""));
          return ok
            ? []
            : [
                {
                  rule: "roots-classified",
                  file: f,
                  target: top ?? f,
                  message:
                    "this file fits no declared root: move it or declare it in architecture.json",
                },
              ];
        });
      },
    },
    // ---------------------------------------------------------------- cycles and dynamic imports
    {
      id: "no-cycles",
      description: "No import cycles between files (ArchUnitTS, imports only)",
      nonNegotiable: 1,
      async check(ctx) {
        const v = await projectFiles(ctx.tsconfig)
          .inPath(`${src}/**`)
          .should()
          .haveNoCycles()
          .check(OPTIONS);
        return toFindings(ctx, "no-cycles", "Import cycle", v);
      },
    },
    {
      id: "no-cycles-complete",
      description:
        "No cycles in the complete graph: imports, re-exports, literal dynamic imports and type imports",
      nonNegotiable: 1,
      async check(ctx) {
        return cycles(graphOf(ctx)).map((c) => ({
          rule: "no-cycles-complete",
          file: c[0] ?? "",
          target: c.join(" -> "),
          message: "Cycle, counting re-exports and dynamic imports",
        }));
      },
    },
    {
      id: "no-dynamic-nonliteral",
      description: "import() takes a string literal, so the graph stays analysable",
      async check(ctx) {
        return graphOf(ctx).problems.map((p) => ({
          rule: "no-dynamic-nonliteral",
          file: p.file,
          target: "import()",
          message: p.message,
        }));
      },
    },
    // ---------------------------------------------------------------- doors and edges
    {
      id: "module-doors",
      description: "A module is entered only through its doors",
      nonNegotiable: 2,
      async check(ctx) {
        const results = await Promise.all(
          modules.map((m) =>
            forbid(
              ctx,
              "module-doors",
              { path: `${src}/**`, except: [modulePath(m)] },
              // table files are judged by tables-owner-only
              { path: modulePath(m), except: [...door(m), `${M}/${m}/*.tables.ts`] },
              `Enter ${m} through ${doorNames.join(" or ")}, not its internals`,
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "declared-edges",
      description: "A module depends only on modules it declares in architecture.json (both doors)",
      nonNegotiable: 2,
      async check(ctx) {
        const results = await Promise.all(
          // a module that may reach every other module has nothing to forbid (an empty selection)
          modules
            .filter((m) => modules.some((o) => o !== m && !allowedTargets(arch, m).includes(o)))
            .map((m) =>
              forbid(
                ctx,
                "declared-edges",
                { path: modulePath(m) },
                {
                  path: `${M}/**`,
                  except: [modulePath(m), ...allowedTargets(arch, m).map((t) => modulePath(t))],
                },
                `${m} has no declared edge to this module`,
              ),
            ),
        );
        return results.flat();
      },
    },
    {
      id: "module-doors-complete",
      description:
        "Doors are the only way in, counting re-exports, literal dynamic imports and require() (resolved through tsconfig paths)",
      nonNegotiable: 2,
      async check(ctx) {
        const g = graphOf(ctx);
        return g.edges
          .filter((e) => !e.external && e.form !== "import")
          .filter((e) => {
            const target = moduleOf(e.to);
            return (
              target &&
              target !== moduleOf(e.from) &&
              !doorNames.includes(e.to.split("/").pop() ?? "") &&
              !/\.tables\.ts$/.test(e.to)
            );
          })
          .map((e) => ({
            rule: "module-doors-complete",
            file: e.from,
            target: e.to,
            message: `${e.form} of ${e.specifier} bypasses the door`,
          }));
      },
    },
    {
      id: "declared-edges-complete",
      description: "Declared edges hold for re-exports and literal dynamic imports too",
      nonNegotiable: 2,
      async check(ctx) {
        const g = graphOf(ctx);
        return g.edges
          .filter((e) => !e.external && e.form !== "import")
          .filter((e) => {
            const from = moduleOf(e.from);
            const to = moduleOf(e.to);
            return from && to && from !== to && !allowedTargets(arch, from).includes(to);
          })
          .map((e) => ({
            rule: "declared-edges-complete",
            file: e.from,
            target: e.to,
            message: `${moduleOf(e.from)} has no declared edge to ${moduleOf(e.to)}`,
          }));
      },
    },
    {
      id: "door-exports",
      description:
        "Doors re-export by name only, and only what their role allows: no export *, no repository, no tables, no aliases, no declarations",
      nonNegotiable: 2,
      async check(ctx) {
        const g = graphOf(ctx);
        const allowed: Record<string, RegExp[]> = {
          browser: [/\.schema\.ts$/, /\.types\.ts$/, /\.rules\.ts$/, /\/components\/[^/]+\.tsx?$/],
          server: [/\.service\.ts$/, /\/components\/[^/]+\.tsx?$/],
        };
        const results = await Promise.all(
          modules.flatMap((m) =>
            Object.entries(arch.doors).map(([name, role]) =>
              content(ctx, "door-exports", { path: `${M}/${m}/${name}` }, (sf, path) => {
                const problems: Problem[] = [];
                for (const stmt of sf.statements) {
                  if (ts.isImportDeclaration(stmt) && !stmt.importClause) continue; // import "server-only"
                  if (
                    !ts.isExportDeclaration(stmt) ||
                    !stmt.moduleSpecifier ||
                    !ts.isStringLiteral(stmt.moduleSpecifier)
                  ) {
                    problems.push({
                      target: "declaration",
                      message: "a door only re-exports by name; put the code in a module file",
                    });
                    continue;
                  }
                  const spec = stmt.moduleSpecifier.text;
                  const clause = stmt.exportClause;
                  if (!clause || ts.isNamespaceExport(clause))
                    problems.push({
                      target: "export *",
                      message: "no wildcard exports: list exports by name",
                    });
                  else
                    for (const el of clause.elements)
                      if (el.propertyName)
                        problems.push({
                          target: el.name.text,
                          message: "doors do not rename exports",
                        });
                  const target = g.resolve(spec, path);
                  if (!target || !(allowed[role] ?? []).some((re) => re.test(target))) {
                    problems.push({
                      target: target ?? spec,
                      message: `a ${role} door may not export from ${target ?? spec}`,
                    });
                  }
                }
                return problems;
              }),
            ),
          ),
        );
        return results.flat();
      },
    },
    // ---------------------------------------------------------------- purity of rules
    {
      id: "rules-pure-imports",
      description:
        "*.rules.ts imports no database, repository, service or src/app (direct imports)",
      nonNegotiable: 3,
      async check(ctx) {
        const from = { path: `${src}/**/*.rules.ts` };
        const banned = [`${src}/**/*.repository.ts`, `${src}/**/*.service.ts`, db, `${APP}/**`];
        const results = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "rules-pure-imports",
              from,
              { path: to },
              "Rules are pure: no database, repository, service or app code",
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "rules-pure-closure",
      description:
        "The runtime closure of a rules file holds only rules, types, schemas, shared/result and allowed packages",
      nonNegotiable: 3,
      async check(ctx) {
        const g = graphOf(ctx);
        const roots = g.files.filter((f) => /\.rules\.ts$/.test(f));
        const okFile = (f: string) =>
          /\.(rules|types|schema)\.ts$/.test(f) || f === at(L.resultFile);
        const okPackage = (p: string) =>
          arch.rulesMayImport.some((a) => p === a || p.startsWith(`${a}/`));
        return roots
          .flatMap((root) => reach(g, [root]))
          .filter((r) => (r.external ? !okPackage(r.node) : !okFile(r.node)))
          .map((r) => ({
            rule: "rules-pure-closure",
            file: r.root,
            target: r.node,
            message: `rules may not reach ${r.node}: ${r.path.join(" -> ")}`,
          }));
      },
    },
    {
      id: "rules-pure-content",
      description:
        "*.rules.ts uses no clock, randomness, environment, network or other ambient global",
      nonNegotiable: 3,
      check: (ctx) =>
        content(ctx, "rules-pure-content", { path: `${src}/**/*.rules.ts` }, (sf) => {
          const problems: Problem[] = [];
          const bannedGlobals = [
            "fetch",
            "process",
            "crypto",
            "performance",
            "setTimeout",
            "setInterval",
            "queueMicrotask",
            "window",
            "document",
            "localStorage",
            "sessionStorage",
            "globalThis",
            "require",
          ];
          for (const s of specifiers(sf)) {
            if (/^(next|react|react-dom|server-only)(\/.*)?$/.test(s) || isBuiltin(s))
              problems.push({ target: s, message: `rules must not import ${s}` });
          }
          walk(sf, (n) => {
            if (!ts.isIdentifier(n) || !isValueReference(n)) return;
            const parent = n.parent;
            if (bannedGlobals.includes(n.text))
              problems.push({
                target: n.text,
                message: `rules must not use the ambient global ${n.text}`,
              });
            if (n.text === "Date") {
              const constructsWithArgs =
                ts.isNewExpression(parent) &&
                parent.expression === n &&
                (parent.arguments?.length ?? 0) > 0;
              if (!constructsWithArgs)
                problems.push({
                  target: ts.isPropertyAccessExpression(parent)
                    ? `Date.${parent.name.text}`
                    : "Date",
                  message: "pass the time in; only new Date(<value>) is allowed",
                });
            }
            if (n.text === "Math") {
              const direct = ts.isPropertyAccessExpression(parent) && parent.expression === n;
              const viaElement = ts.isElementAccessExpression(parent) && parent.expression === n;
              if (!direct && !viaElement)
                problems.push({
                  target: "Math",
                  message: "do not alias Math: Math.random is banned",
                });
              else if (direct && parent.name.text === "random")
                problems.push({ target: "Math.random", message: "pass randomness in" });
              else if (viaElement)
                problems.push({ target: "Math[...]", message: "no computed Math access" });
            }
          });
          return problems;
        }),
    },
    // ---------------------------------------------------------------- ui, shared, app, components
    {
      id: "ui-no-modules",
      description:
        "src/ui never imports modules (it is the project's own design system: no business nouns)",
      nonNegotiable: 10,
      check: (ctx) =>
        forbid(
          ctx,
          "ui-no-modules",
          { path: `${UI}/**` },
          { path: modulePath("*") },
          "src/ui has no business nouns",
        ),
    },
    {
      id: "ui-no-server",
      description: "src/ui never imports clients, db, auth, env, access, server-only or app code",
      nonNegotiable: 10,
      neverBaseline: true,
      async check(ctx) {
        const banned = [`${CLIENTS}/**`, `${APP}/**`, db, ...sharedServer];
        const deps = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "ui-no-server",
              { path: `${UI}/**` },
              { path: to },
              "src/ui never imports server code",
            ),
          ),
        );
        const serverOnly = await content(ctx, "ui-no-server", { path: `${UI}/**` }, (sf) =>
          specifiers(sf).includes("server-only")
            ? [{ target: "server-only", message: "src/ui never imports server code" }]
            : [],
        );
        return [...deps.flat(), ...serverOnly];
      },
    },
    {
      id: "shared-no-modules",
      description: "src/shared never imports modules, db or app code",
      nonNegotiable: 10,
      async check(ctx) {
        const results = await Promise.all(
          [modulePath("*"), `${APP}/**`, db].map((to) =>
            forbid(
              ctx,
              "shared-no-modules",
              { path: `${SHARED}/**` },
              { path: to },
              "src/shared stays generic",
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "nothing-imports-app",
      description: "Nothing imports src/app",
      check: (ctx) =>
        forbid(
          ctx,
          "nothing-imports-app",
          { path: `${src}/**`, except: [`${APP}/**`] },
          { path: `${APP}/**` },
          "app/ is the outermost layer: nothing imports it",
        ),
    },
    {
      id: "components-no-persistence",
      description: "Components never import a repository, tables or the database",
      nonNegotiable: 10,
      async check(ctx) {
        const banned = [`${src}/**/*.repository.ts`, `${src}/**/*.tables.ts`, db];
        const results = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "components-no-persistence",
              { path: `${M}/*/components/**` },
              { path: to },
              "Components get data through props",
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "app-no-persistence",
      description: "src/app never imports a repository, tables or the database",
      nonNegotiable: 6,
      async check(ctx) {
        const banned = [`${src}/**/*.repository.ts`, `${src}/**/*.tables.ts`, db];
        const results = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "app-no-persistence",
              { path: `${APP}/**` },
              { path: to },
              "app/ calls a module's server.ts, never persistence",
            ),
          ),
        );
        return results.flat();
      },
    },
    // ---------------------------------------------------------------- data ownership
    {
      id: "tables-owner-only",
      description:
        "Only the owner module (and src/db, and declared read-exception files) imports its table files",
      nonNegotiable: 4,
      async check(ctx) {
        const exceptionFiles = arch.readExceptions.map((x) => x.file);
        const results = await Promise.all(
          modules.map((owner) =>
            forbid(
              ctx,
              "tables-owner-only",
              {
                path: `${src}/**`,
                except: [
                  modulePath(owner),
                  db,
                  ...exceptionFiles.filter(
                    (f) =>
                      arch.tables[arch.readExceptions.find((x) => x.file === f)?.table ?? ""] ===
                      owner,
                  ),
                ],
              },
              { path: `${M}/${owner}/*.tables.ts` },
              `Only ${owner} imports its tables; call its service, or declare a read exception for one file and one table`,
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "read-exceptions-exact",
      description:
        "A read exception imports only its declared table, by name, and never writes it or runs raw SQL",
      nonNegotiable: 4,
      async check(ctx) {
        const g = graphOf(ctx);
        const files = [...new Set(arch.readExceptions.map((x) => x.file))];
        const stale = files
          .filter((f) => !g.files.includes(f))
          .map((f) => ({
            rule: "read-exceptions-exact",
            file: "architecture.json",
            target: f,
            message: "a declared read-exception file does not exist",
          }));
        const results = await Promise.all(
          files
            .filter((f) => g.files.includes(f))
            .map((file) =>
              content(ctx, "read-exceptions-exact", { path: file }, (sf, path) => {
                const mine = arch.readExceptions.filter((x) => x.file === path);
                const allowedNames = new Set<string>();
                const foreign = new Map<string, string>(); // local binding -> exported name
                const problems: Problem[] = [];
                for (const stmt of sf.statements) {
                  if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier))
                    continue;
                  const target = g.resolve(stmt.moduleSpecifier.text, path);
                  if (
                    !target ||
                    !/\.tables\.ts$/.test(target) ||
                    moduleOf(target) === moduleOf(path)
                  )
                    continue;
                  const owned = new Map<string, string>(); // table name -> export identifier
                  for (const s of g.sources.get(target)?.statements ?? []) {
                    if (!ts.isVariableStatement(s)) continue;
                    for (const d of s.declarationList.declarations) {
                      const init = d.initializer;
                      if (
                        ts.isIdentifier(d.name) &&
                        init &&
                        ts.isCallExpression(init) &&
                        ts.isIdentifier(init.expression) &&
                        init.expression.text === "pgTable"
                      ) {
                        const [first] = init.arguments;
                        if (first && ts.isStringLiteralLike(first))
                          owned.set(first.text, d.name.text);
                      }
                    }
                  }
                  for (const x of mine) {
                    const id = owned.get(x.table);
                    if (id) allowedNames.add(id);
                  }
                  const named = stmt.importClause?.namedBindings;
                  if (!named || !ts.isNamedImports(named)) {
                    problems.push({
                      target: target,
                      message:
                        "import the declared table by name: a namespace or default import hides which tables are read",
                    });
                    continue;
                  }
                  for (const el of named.elements) {
                    const exported = (el.propertyName ?? el.name).text;
                    foreign.set(el.name.text, exported);
                    if (!allowedNames.has(exported))
                      problems.push({
                        target: exported,
                        message: `${path} may read only its declared table, not ${exported}`,
                      });
                  }
                }
                walk(sf, (n) => {
                  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
                    const method = n.expression.name.text;
                    const [first] = n.arguments;
                    if (
                      ["insert", "update", "delete"].includes(method) &&
                      first &&
                      ts.isIdentifier(first) &&
                      foreign.has(first.text)
                    ) {
                      problems.push({
                        target: `${method}(${first.text})`,
                        message: "a read exception reads: writes belong to the owner's repository",
                      });
                    }
                    if (method === "execute")
                      problems.push({
                        target: "execute()",
                        message:
                          "raw SQL cannot be checked: use the query builder, or ask the owner for a query function",
                      });
                  }
                  if (
                    ts.isTaggedTemplateExpression(n) &&
                    ts.isIdentifier(n.tag) &&
                    n.tag.text === "sql"
                  )
                    problems.push({
                      target: "sql``",
                      message: "raw SQL cannot be checked in a read exception",
                    });
                });
                return problems;
              }),
            ),
        );
        return [...stale, ...results.flat()];
      },
    },
    {
      id: "table-definitions-declared",
      description:
        "Every literal pgTable in a module's flat *.tables.ts is declared, owned by that module, and defined once (it does not see raw SQL, aliased builders or subfolders)",
      nonNegotiable: 4,
      async check(ctx) {
        const defined = new Map<string, string>();
        const findings = await content(
          ctx,
          "table-definitions-declared",
          { path: `${M}/*/*.tables.ts` },
          (sf, path) => {
            const owner = moduleOf(path) ?? "";
            return definedTables(sf).flatMap((table) => {
              const declared = arch.tables[table];
              const problems: Problem[] = [];
              if (defined.has(table))
                problems.push({
                  target: table,
                  message: `table ${table} is also defined in ${defined.get(table)}`,
                });
              defined.set(table, path);
              if (declared === undefined)
                problems.push({
                  target: table,
                  message: `table ${table} is not declared in architecture.json`,
                });
              else if (declared !== owner)
                problems.push({
                  target: table,
                  message: `table ${table} is declared as owned by ${declared} but defined in ${owner}`,
                });
              return problems;
            });
          },
        );
        const orphans = Object.keys(arch.tables)
          .filter((t) => !defined.has(t))
          .map((t) => ({
            rule: "table-definitions-declared",
            file: "architecture.json",
            target: t,
            message: `declared table ${t} is defined nowhere`,
          }));
        return [...findings, ...orphans];
      },
    },
    {
      id: "schema-composition",
      description:
        "src/db/schema.ts composes every module's table files; only src/db/index.ts imports it; src/db imports tables only",
      nonNegotiable: 4,
      async check(ctx) {
        const g = graphOf(ctx);
        const schema = at(L.schemaRoot);
        const composed = new Set(g.edges.filter((e) => e.from === schema).map((e) => e.to));
        const missing = g.files
          .filter((f) => new RegExp(`^${M}/[^/]+/[^/]+\\.tables\\.ts$`).test(f) && !composed.has(f))
          .map((f) => ({
            rule: "schema-composition",
            file: schema,
            target: f,
            message: "this table file is not composed into the schema",
          }));
        const intruders = await forbid(
          ctx,
          "schema-composition",
          { path: `${src}/**`, except: [db] },
          { path: schema },
          "Only src/db/index.ts imports the schema composition root",
        );
        const leaks = await forbid(
          ctx,
          "schema-composition",
          { path: db },
          { path: `${M}/**`, except: [`${M}/*/*.tables.ts`] },
          "src/db imports table files only",
        );
        return [...missing, ...intruders, ...leaks];
      },
    },
    {
      id: "providers-in-client-folder",
      description: "A client's providers are imported only inside that client's folder",
      nonNegotiable: 8,
      async check(ctx) {
        const results = await Promise.all(
          arch.clients.map((c) =>
            forbid(
              ctx,
              "providers-in-client-folder",
              { path: `${src}/**`, except: [`${CLIENTS}/${c}/**`] },
              { path: `${CLIENTS}/${c}/providers/**` },
              `Use the ${c} client's index, never a provider`,
            ),
          ),
        );
        return results.flat();
      },
    },
    // ---------------------------------------------------------------- runtime boundaries
    {
      id: "use-server-only-in-app",
      description: '"use server" (a real directive prologue) appears in src/app only',
      nonNegotiable: 6,
      check: (ctx) =>
        content(
          ctx,
          "use-server-only-in-app",
          { path: `${src}/**`, except: [`${APP}/**`] },
          (sf) =>
            hasDirective(sf, "use server")
              ? [{ target: "use server", message: "actions live in app/ and stay thin" }]
              : [],
        ),
    },
    {
      id: "server-only-in-server-files",
      description:
        'Server doors, services, repositories, src/db, server-only shared files and client indexes start with import "server-only"',
      nonNegotiable: 7,
      neverBaseline: true,
      async check(ctx) {
        const globs = [
          ...modules.flatMap((m) => serverDoorNames.map((d) => `${M}/${m}/${d}`)),
          `${src}/**/*.service.ts`,
          `${src}/**/*.repository.ts`,
          at(L.dbClient),
          ...sharedServer,
          `${CLIENTS}/*/index.ts`,
        ];
        const results = await Promise.all(
          globs.map((g) =>
            content(ctx, "server-only-in-server-files", { path: g }, (sf) =>
              importsServerOnly(sf)
                ? []
                : [{ target: "server-only", message: 'missing import "server-only"' }],
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "public-door-closure",
      description:
        "The runtime closure of a browser door reaches no server code, server-only package, Node builtin or secret (erased type imports are fine)",
      nonNegotiable: 7,
      neverBaseline: true,
      async check(ctx) {
        const roots = modules
          .flatMap((m) => browserDoorNames.map((d) => `${M}/${m}/${d}`))
          .filter((f) => graphOf(ctx).files.includes(f));
        return closure(ctx, "public-door-closure", roots, "a browser door");
      },
    },
    {
      id: "client-runtime-closure",
      description:
        'The runtime closure of a "use client" file reaches no server code, server-only package, Node builtin or secret (erased type imports are fine)',
      nonNegotiable: 7,
      neverBaseline: true,
      async check(ctx) {
        const g = graphOf(ctx);
        const roots = g.files.filter(
          (f) => g.sources.get(f) && hasDirective(g.sources.get(f)!, "use client"),
        );
        return closure(ctx, "client-runtime-closure", roots, "a client component");
      },
    },
    // ---------------------------------------------------------------- access and transactions
    {
      id: "system-operations-from-routes-only",
      description:
        "Webhook and job operations are called only from route handlers (and from other webhook/job operations), never from actions, pages, components or user operations",
      nonNegotiable: 6,
      async check(ctx) {
        const g = graphOf(ctx);
        const ops = systemOps(ctx);
        const findings: Finding[] = [];
        for (const [file, sf] of g.sources) {
          if (isRoutes(file)) continue;
          const bound = new Map<string, string>(); // local name -> "module.operation"
          const note = (target: string, message: string) =>
            findings.push({ rule: "system-operations-from-routes-only", file, target, message });
          for (const stmt of sf.statements) {
            const isImport = ts.isImportDeclaration(stmt);
            if (
              !(isImport || ts.isExportDeclaration(stmt)) ||
              !stmt.moduleSpecifier ||
              !ts.isStringLiteral(stmt.moduleSpecifier)
            )
              continue;
            const target = g.resolve(stmt.moduleSpecifier.text, file);
            const m = target ? moduleOf(target) : null;
            if (
              !target ||
              !m ||
              doorRole(target) !== "server" ||
              !ops.has(m) ||
              m === moduleOf(file)
            )
              continue;
            const names = ops.get(m)!;
            const clause = isImport ? stmt.importClause?.namedBindings : stmt.exportClause;
            if (!clause || ts.isNamespaceImport(clause) || ts.isNamespaceExport(clause)) {
              note(
                `${m}.*`,
                `${m} has system operations: import the user operations by name, not the whole door`,
              );
              continue;
            }
            for (const el of clause.elements) {
              const original = (el.propertyName ?? el.name).text;
              if (!names.has(original)) continue;
              bound.set(el.name.text, `${m}.${original}`);
              // a webhook/job operation may be called by another system operation (service files), see below
              if (!isServiceFile(file))
                note(
                  `${m}.${original}`,
                  "a system operation is reachable only from a route handler that verified the caller",
                );
            }
          }
          if (!isServiceFile(file) || bound.size === 0) continue;
          walk(sf, (n) => {
            if (
              !ts.isCallExpression(n) ||
              !ts.isIdentifier(n.expression) ||
              n.expression.text !== "operation"
            )
              return;
            const access = accessOf(n);
            if (access === "webhook" || access === "job") return;
            const used = identifiersIn(n.arguments[1] ?? n);
            for (const [local, full] of bound)
              if (used.has(local))
                note(
                  full,
                  `a ${access ?? "user"} operation must not call the system operation ${full}`,
                );
          });
        }
        return findings;
      },
    },
    {
      id: "access-declared",
      description:
        "DIAGNOSTIC: exported service functions are created with operation({ access }, …). The proof is the policy registry test, not this syntax check",
      severity: "diagnostic",
      nonNegotiable: 6,
      check: (ctx) =>
        content(ctx, "access-declared", { path: `${src}/**/*.service.ts` }, (sf) => {
          const problems: Problem[] = [];
          for (const stmt of sf.statements) {
            const exported =
              ts.canHaveModifiers(stmt) &&
              ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
            if (!exported) continue;
            if (ts.isFunctionDeclaration(stmt) && stmt.name)
              problems.push({
                target: stmt.name.text,
                message: `${stmt.name.text} is not wrapped in operation({ access }, …)`,
              });
            if (ts.isVariableStatement(stmt)) {
              for (const d of stmt.declarationList.declarations) {
                const init = d.initializer;
                if (
                  ts.isIdentifier(d.name) &&
                  init &&
                  !(ts.isCallExpression(init) && callsFunction(init, ["operation"]))
                ) {
                  problems.push({
                    target: d.name.text,
                    message: `${d.name.text} is not wrapped in operation({ access }, …)`,
                  });
                }
              }
            }
          }
          return problems;
        }),
    },
    {
      id: "workflow-header",
      description:
        "An action or route that sequences two or more modules documents the four workflow questions",
      nonNegotiable: 9,
      async check(ctx) {
        const analyze = (sf: ts.SourceFile, _path: string, text: string): Problem[] => {
          const touched = new Set(
            specifiers(sf)
              .map((x) => new RegExp(`/${L.modules}/([^/]+)/`).exec(x)?.[1])
              .filter(Boolean),
          );
          if (touched.size < 2) return [];
          return ["@workflow", "retry-safe:", "duplicates:", "recovery:", "survives-restart:"]
            .filter((k) => !text.includes(k))
            .map((k) => ({ target: k, message: `workflow header is missing ${k}` }));
        };
        const results = await Promise.all(
          ["route.ts", "actions.ts"].map((name) =>
            content(ctx, "workflow-header", { path: `${APP}/**/${name}` }, analyze),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "transaction-discipline",
      description:
        "Transactions open only through inTransaction in a service; nothing external and no pool call inside; no nesting; a function that receives a Tx never opens one",
      nonNegotiable: 5,
      check: (ctx) =>
        content(ctx, "transaction-discipline", { path: `${src}/**` }, (sf, path) => {
          const g = graphOf(ctx);
          const problems: Problem[] = [];
          const bindings = importedBindings(sf, () => true);
          const isTxCall = (n: ts.Node): n is ts.CallExpression =>
            ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === "inTransaction";
          const functions = new Map<string, ts.Node>();
          for (const s of sf.statements) {
            if (ts.isFunctionDeclaration(s) && s.name) functions.set(s.name.text, s);
            if (ts.isVariableStatement(s))
              for (const d of s.declarationList.declarations)
                if (ts.isIdentifier(d.name) && d.initializer)
                  functions.set(d.name.text, d.initializer);
          }

          walk(sf, (n) => {
            // the one gateway: db.transaction(...) only inside src/db/index.ts
            if (
              ts.isCallExpression(n) &&
              ts.isPropertyAccessExpression(n.expression) &&
              n.expression.name.text === "transaction" &&
              path !== at(L.dbClient)
            ) {
              problems.push({
                target: "transaction()",
                message: "open transactions with inTransaction from @/db, the single gateway",
              });
            }
            // a function that receives a Tx is inside its caller's transaction
            if (
              (ts.isFunctionDeclaration(n) ||
                ts.isArrowFunction(n) ||
                ts.isFunctionExpression(n)) &&
              n.parameters.some(
                (p) =>
                  p.type && ts.isTypeReferenceNode(p.type) && p.type.typeName.getText() === "Tx",
              )
            ) {
              walk(n, (m) => {
                if (isTxCall(m))
                  problems.push({
                    target: "inTransaction",
                    message: "a function that receives a Tx must not open its own transaction",
                  });
              });
            }
            if (!isTxCall(n)) return;
            if (!/\.service\.ts$/.test(path))
              problems.push({
                target: "inTransaction",
                message: "only a service owns a transaction boundary",
              });
            const [arg] = n.arguments;
            const callback =
              arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))
                ? arg
                : arg && ts.isIdentifier(arg)
                  ? functions.get(arg.text)
                  : undefined;
            if (
              !callback ||
              !(
                ts.isArrowFunction(callback) ||
                ts.isFunctionExpression(callback) ||
                ts.isFunctionDeclaration(callback)
              )
            ) {
              problems.push({
                target: "inTransaction",
                message:
                  "the transaction callback must be an inline function or a function declared in the same file, so it can be checked",
              });
              return;
            }
            const first = callback.parameters[0]?.name;
            const tx = first && ts.isIdentifier(first) ? first.text : null;
            walk(callback, (m) => {
              if (isTxCall(m) && m !== n)
                problems.push({
                  target: "inTransaction",
                  message: "nested transaction: the outer service owns the boundary",
                });
              if (!ts.isCallExpression(m)) return;
              const callee =
                ts.isPropertyAccessExpression(m.expression) &&
                ts.isIdentifier(m.expression.expression)
                  ? m.expression.expression
                  : ts.isIdentifier(m.expression)
                    ? m.expression
                    : null;
              if (!callee) return;
              if (callee.text === "fetch")
                problems.push({
                  target: "fetch",
                  message: "no network call inside a transaction: record the work, let a job do it",
                });
              const spec = bindings.get(callee.text);
              const target = spec ? g.resolve(spec, path) : null;
              if (!target) return;
              if (target.startsWith(`${CLIENTS}/`))
                problems.push({
                  target: callee.text,
                  message:
                    "no external client call inside a transaction: record the work, let a job do it",
                });
              else if (
                doorRole(target) === "server" &&
                !(tx && m.arguments.some((a) => ts.isIdentifier(a) && a.text === tx))
              ) {
                problems.push({
                  target: callee.text,
                  message:
                    "an operation called inside a transaction must receive the transaction (it would run on the pool)",
                });
              }
            });
          });
          return problems;
        }),
    },
  ];
}

/** Findings the policy file's exemptions waive. */
function applyExemptions(arch: Architecture, findings: Finding[]): Finding[] {
  const exemptions = arch.exemptions.map((e) => ({ ...e, re: globToRegExp(e.path) }));
  return findings.filter(
    (f) => !exemptions.some((e) => e.rules.includes(f.rule) && e.re.test(f.file)),
  );
}

/**
 * Stable occurrence identity: `rule|file|target#n`. The n-th occurrence of the same rule, file
 * and target gets suffix n, so a second violation of the same kind in the same file is a NEW
 * entry (multiplicity is preserved), and fixing one leaves the others' lines untouched.
 */
export function findingKeys(findings: Finding[]): string[] {
  const seen = new Map<string, number>();
  return [...findings]
    .sort((a, b) =>
      `${a.rule}|${a.file}|${a.target}|${a.message}`.localeCompare(
        `${b.rule}|${b.file}|${b.target}|${b.message}`,
      ),
    )
    .map((f) => {
      const base = `${f.rule}|${f.file}|${f.target}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return `${base}#${n}`;
    });
}

export async function runAll(ctx: Ctx): Promise<Finding[]> {
  const rules = buildRules(ctx.arch);
  const all = (await Promise.all(rules.map((r) => r.check(ctx)))).flat();
  return applyExemptions(ctx.arch, all);
}
