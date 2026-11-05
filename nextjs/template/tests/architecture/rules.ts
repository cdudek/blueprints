// Every architecture rule, built at runtime from architecture.json: no generated code to commit.
// Rules are plain functions of a context (policy + tsconfig), so the same rules judge the real
// tree (architecture.test.ts) and the deliberate-violation fixtures (fixtures.test.ts).
//
// Two engines, because each has blind spots:
//   - ArchUnitTS reads only top-level `import … from` between project files: it gives cycles and
//     precise folder-to-folder rules, but cannot see `export … from`, dynamic import() or
//     node_modules imports.
//   - Content rules (`adhereTo`) read the syntax tree of a file, so they also see re-exports,
//     dynamic imports and packages such as next, react and server-only.
// eslint-plugin-boundaries (generated from the same file) additionally covers re-exports and
// dynamic imports between project files, with editor feedback.
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { projectFiles, type FileInfo, type Violation } from "archunit";
import type ts from "typescript";
import {
  allowedTargets,
  globToRegExp,
  moduleNames,
  tableOwnersReadBy,
  type Architecture,
} from "../../scripts/arch/lib.mjs";
import {
  callsFunction,
  definedTables,
  exportedFunctions,
  hasDirective,
  identifiersIn,
  importedBindings,
  importsServerOnly,
  parse,
  specifiers,
  transactionCallbacks,
  usesMember,
  usesNewDateWithoutArguments,
} from "./ast";

export type Ctx = { arch: Architecture; tsconfig: string; root: string };
export type Finding = { rule: string; file: string; target: string; message: string };
export type ArchRule = {
  id: string;
  description: string;
  /** Number in ARCHITECTURE.md section 12. Non-negotiable rules can never be baselined. */
  nonNegotiable?: number;
  check: (ctx: Ctx) => Promise<Finding[]>;
};

const OPTIONS = { allowEmptyTests: true };
const posix = (p: string) => p.split("\\").join("/");
const rel = (ctx: Ctx, p: string) => posix(isAbsolute(p) ? relative(ctx.root, p) : p);

type RawViolation = Violation & {
  dependency?: { sourceLabel: string; targetLabel: string };
  fileInfo?: { path: string };
  cycle?: { sourceLabel: string; targetLabel: string }[];
  message?: string;
};

function toFindings(ctx: Ctx, rule: string, message: string, violations: Violation[]): Finding[] {
  return (violations as RawViolation[]).flatMap((v) => {
    if (v.dependency) {
      return [
        {
          rule,
          file: rel(ctx, v.dependency.sourceLabel),
          target: rel(ctx, v.dependency.targetLabel),
          message,
        },
      ];
    }
    if (v.cycle) {
      const files = v.cycle.map((e) => rel(ctx, e.sourceLabel));
      return [
        { rule, file: [...files].sort()[0] ?? "", target: [...files].sort().join(" -> "), message },
      ];
    }
    if (v.fileInfo) return [{ rule, file: rel(ctx, v.fileInfo.path), target: "", message }];
    return [
      { rule, file: "", target: "", message: `${message} (${v.message ?? JSON.stringify(v)})` },
    ];
  });
}

type Spec = { path: string; except?: string[] };
const spec = ({ path, except }: Spec) => [path, except?.length ? { except } : undefined] as const;

/** `from` must not depend on `to` (ArchUnitTS, project files only). */
async function forbid(
  ctx: Ctx,
  rule: string,
  from: Spec,
  to: Spec,
  message: string,
): Promise<Finding[]> {
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
  analyze: (sf: ts.SourceFile, file: FileInfo) => Problem[],
): Promise<Finding[]> {
  const found: Finding[] = [];
  await projectFiles(ctx.tsconfig)
    .inPath(...spec(from))
    .should()
    .adhereTo((file) => {
      const path = rel(ctx, file.path);
      const text = readFileSync(join(ctx.root, path), "utf8");
      const problems = analyze(parse(path, text), { ...file, path, content: text });
      for (const p of problems)
        found.push({ rule, file: path, target: p.target, message: p.message });
      return problems.length === 0;
    }, rule)
    .check(OPTIONS);
  return found;
}

const modulePath = (src: string, name: string) => `${src}/modules/${name}/**`;

export function buildRules(arch: Architecture): ArchRule[] {
  const src = arch.srcRoot;
  const modules = moduleNames(arch);
  const door = (m: string) => arch.doors.map((d) => `${src}/modules/${m}/${d}`);
  const noModulesOrApp = [modulePath(src, "*"), `${src}/app/**`];

  return [
    {
      id: "no-cycles",
      description: "No import cycles between files",
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
      id: "module-doors",
      description: "A module is entered only through its doors",
      nonNegotiable: 2,
      async check(ctx) {
        const results = await Promise.all(
          modules.map((m) =>
            forbid(
              ctx,
              "module-doors",
              { path: `${src}/**`, except: [modulePath(src, m)] },
              // table files are judged by tables-owner-only
              { path: modulePath(src, m), except: [...door(m), `${src}/modules/${m}/*.tables.ts`] },
              `Enter ${m} through ${arch.doors.join(" or ")}, not its internals`,
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "declared-edges",
      description: "A module depends only on modules it declares in architecture.json",
      nonNegotiable: 2,
      async check(ctx) {
        const results = await Promise.all(
          modules.map((m) =>
            forbid(
              ctx,
              "declared-edges",
              { path: modulePath(src, m) },
              {
                path: `${src}/modules/**`,
                except: [
                  modulePath(src, m),
                  ...allowedTargets(arch, m).map((t) => modulePath(src, t)),
                ],
              },
              `${m} has no declared edge to this module`,
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "modules-declared",
      description: "Every module folder is declared, and has its doors",
      nonNegotiable: 2,
      async check(ctx) {
        const declared = new Set(modules);
        const seen = new Set<string>();
        const findings = await content(
          ctx,
          "modules-declared",
          { path: `${src}/modules/**` },
          (_sf, file) => {
            const name = posix(file.path).split("/modules/")[1]?.split("/")[0] ?? "";
            seen.add(name);
            return declared.has(name)
              ? []
              : [{ target: name, message: `module folder ${name} is not in architecture.json` }];
          },
        );
        const missing = [...declared]
          .filter((m) => !seen.has(m))
          .map((m) => ({
            rule: "modules-declared",
            file: "architecture.json",
            target: m,
            message: `module ${m} has no files`,
          }));
        return [...findings, ...missing];
      },
    },
    {
      id: "rules-pure-imports",
      description: "*.rules.ts imports no database, repository, service or src/app",
      nonNegotiable: 3,
      async check(ctx) {
        const from = { path: `${src}/**/*.rules.ts` };
        const banned = [
          `${src}/**/*.repository.ts`,
          `${src}/**/*.service.ts`,
          `${src}/shared/db.ts`,
          `${src}/app/**`,
        ];
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
      id: "rules-pure-content",
      description: "*.rules.ts bans next, react, process.env, Date.now, Math.random and new Date()",
      nonNegotiable: 3,
      check: (ctx) =>
        content(ctx, "rules-pure-content", { path: `${src}/**/*.rules.ts` }, (sf) => {
          const problems: Problem[] = [];
          for (const s of specifiers(sf)) {
            if (/^(next|react|react-dom|server-only)(\/.*)?$/.test(s))
              problems.push({ target: s, message: `rules must not import ${s}` });
          }
          if (usesMember(sf, "process", "env"))
            problems.push({
              target: "process.env",
              message: "rules must not read the environment",
            });
          if (usesMember(sf, "Date", "now"))
            problems.push({ target: "Date.now", message: "pass the time in" });
          if (usesMember(sf, "Math", "random"))
            problems.push({ target: "Math.random", message: "pass randomness in" });
          if (usesNewDateWithoutArguments(sf))
            problems.push({ target: "new Date()", message: "pass the time in" });
          return problems;
        }),
    },
    {
      id: "ui-no-modules",
      description: "src/ui never imports modules",
      nonNegotiable: 10,
      check: (ctx) =>
        forbid(
          ctx,
          "ui-no-modules",
          { path: `${src}/ui/**` },
          { path: modulePath(src, "*") },
          "src/ui is the design system: no business nouns",
        ),
    },
    {
      id: "ui-no-server",
      description: "src/ui never imports clients, the database, auth, env, server-only or app code",
      nonNegotiable: 10,
      async check(ctx) {
        const banned = [
          `${src}/clients/**`,
          `${src}/app/**`,
          `${src}/shared/db.ts`,
          `${src}/shared/auth.ts`,
          `${src}/shared/env.ts`,
        ];
        const deps = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "ui-no-server",
              { path: `${src}/ui/**` },
              { path: to },
              "src/ui never imports server code",
            ),
          ),
        );
        const serverOnly = await content(ctx, "ui-no-server", { path: `${src}/ui/**` }, (sf) =>
          specifiers(sf).includes("server-only")
            ? [{ target: "server-only", message: "src/ui never imports server code" }]
            : [],
        );
        return [...deps.flat(), ...serverOnly];
      },
    },
    {
      id: "shared-no-modules",
      description: "src/shared never imports modules or app code",
      nonNegotiable: 10,
      async check(ctx) {
        const results = await Promise.all(
          noModulesOrApp.map((to) =>
            forbid(
              ctx,
              "shared-no-modules",
              { path: `${src}/shared/**` },
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
          { path: `${src}/**`, except: [`${src}/app/**`] },
          { path: `${src}/app/**` },
          "app/ is the outermost layer: nothing imports it",
        ),
    },
    {
      id: "components-no-persistence",
      description: "Components never import a repository, tables or the database",
      nonNegotiable: 10,
      async check(ctx) {
        const banned = [
          `${src}/**/*.repository.ts`,
          `${src}/**/*.tables.ts`,
          `${src}/shared/db.ts`,
        ];
        const results = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "components-no-persistence",
              { path: `${src}/modules/*/components/**` },
              { path: to },
              "Components get data through props",
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "tables-owner-only",
      description: "Only the owner module imports its table files (plus declared read exceptions)",
      nonNegotiable: 4,
      async check(ctx) {
        const results = await Promise.all(
          modules.map((owner) => {
            const readers = modules.filter(
              (r) =>
                allowedTargets(arch, r).includes(owner) &&
                tableOwnersReadBy(arch, r).includes(owner),
            );
            return forbid(
              ctx,
              "tables-owner-only",
              {
                path: `${src}/**`,
                except: [modulePath(src, owner), ...readers.map((r) => modulePath(src, r))],
              },
              { path: `${src}/modules/${owner}/*.tables.ts` },
              `Only ${owner} imports its tables; declare a read exception in architecture.json or call its service`,
            );
          }),
        );
        return results.flat();
      },
    },
    {
      id: "table-owners-match",
      description: "Every pgTable is declared in architecture.json and lives in its owner module",
      nonNegotiable: 4,
      async check(ctx) {
        const defined = new Set<string>();
        const findings = await content(
          ctx,
          "table-owners-match",
          { path: `${src}/modules/*/*.tables.ts` },
          (sf, file) => {
            const owner = posix(file.path).split("/modules/")[1]?.split("/")[0] ?? "";
            return definedTables(sf).flatMap((table) => {
              defined.add(table);
              const declared = arch.tables[table];
              if (declared === undefined)
                return [
                  { target: table, message: `table ${table} is not declared in architecture.json` },
                ];
              if (declared !== owner)
                return [
                  {
                    target: table,
                    message: `table ${table} is declared as owned by ${declared} but defined in ${owner}`,
                  },
                ];
              return [];
            });
          },
        );
        const orphans = Object.keys(arch.tables)
          .filter((t) => !defined.has(t))
          .map((t) => ({
            rule: "table-owners-match",
            file: "architecture.json",
            target: t,
            message: `declared table ${t} is defined nowhere`,
          }));
        return [...findings, ...orphans];
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
              { path: `${src}/**`, except: [`${src}/clients/${c}/**`] },
              { path: `${src}/clients/${c}/providers/**` },
              `Use the ${c} client's index, never a provider`,
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "use-server-only-in-app",
      description: '"use server" files live in src/app only',
      nonNegotiable: 6,
      check: (ctx) =>
        content(
          ctx,
          "use-server-only-in-app",
          { path: `${src}/**`, except: [`${src}/app/**`] },
          (sf) =>
            hasDirective(sf, "use server")
              ? [{ target: "use server", message: "actions live in app/ and stay thin" }]
              : [],
        ),
    },
    {
      id: "app-no-persistence",
      description: "src/app never imports a repository, tables or the database",
      nonNegotiable: 6,
      async check(ctx) {
        const banned = [
          `${src}/**/*.repository.ts`,
          `${src}/**/*.tables.ts`,
          `${src}/shared/db.ts`,
        ];
        const results = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "app-no-persistence",
              { path: `${src}/app/**` },
              { path: to },
              "app/ calls a module's server.ts, never persistence",
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "service-authenticates",
      description:
        "Every exported service operation calls requireUser or requireRole (webhook and job operations are named so)",
      nonNegotiable: 6,
      check: (ctx) =>
        content(ctx, "service-authenticates", { path: `${src}/**/*.service.ts` }, (sf) =>
          exportedFunctions(sf)
            .filter(({ name }) => !/(FromWebhook|FromJob)$/.test(name))
            .filter(({ node }) => !callsFunction(node, ["requireUser", "requireRole"]))
            .map(({ name }) => ({
              target: name,
              message: `${name} must authenticate, or be named ...FromWebhook / ...FromJob`,
            })),
        ),
    },
    {
      id: "no-external-in-transaction",
      description:
        "No client or fetch call inside db.transaction (direct calls; indirect ones are review-only)",
      nonNegotiable: 5,
      check: (ctx) =>
        content(ctx, "no-external-in-transaction", { path: `${src}/**/*.service.ts` }, (sf) => {
          const external = importedBindings(sf, (s) => /(^|\/)clients\//.test(s));
          return transactionCallbacks(sf).flatMap((cb) => {
            const used = identifiersIn(cb);
            const hits = [...external.keys(), "fetch"].filter((name) => used.has(name));
            return hits.map((name) => ({
              target: name,
              message: `${name} is called inside a transaction: record the work, let a job do it`,
            }));
          });
        }),
    },
    {
      id: "server-only-in-server-files",
      description:
        'Server doors, services, repositories, shared server files and client indexes start with import "server-only"',
      nonNegotiable: 7,
      async check(ctx) {
        const globs = [
          `${src}/modules/*/server.ts`,
          `${src}/**/*.service.ts`,
          `${src}/**/*.repository.ts`,
          `${src}/shared/db.ts`,
          `${src}/shared/auth.ts`,
          `${src}/shared/env.ts`,
          `${src}/clients/*/index.ts`,
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
      id: "public-door-browser-safe",
      description:
        "public.ts imports no service, repository, server door or server-only shared file",
      nonNegotiable: 7,
      async check(ctx) {
        const banned = [
          `${src}/**/*.service.ts`,
          `${src}/**/*.repository.ts`,
          `${src}/modules/*/server.ts`,
          `${src}/shared/db.ts`,
          `${src}/shared/auth.ts`,
          `${src}/shared/env.ts`,
        ];
        const results = await Promise.all(
          banned.map((to) =>
            forbid(
              ctx,
              "public-door-browser-safe",
              { path: `${src}/modules/*/public.ts` },
              { path: to },
              "public.ts is browser-safe",
            ),
          ),
        );
        return results.flat();
      },
    },
    {
      id: "client-components-public-only",
      description:
        '"use client" files import only public doors: no server door, service, repository, db, auth, env, clients, server-only or next/headers',
      nonNegotiable: 7,
      check: (ctx) =>
        content(ctx, "client-components-public-only", { path: `${src}/**` }, (sf) => {
          if (!hasDirective(sf, "use client")) return [];
          const banned = [
            /(^|\/)server$/,
            /\.(service|repository|tables)$/,
            /(^|\/)shared\/(db|auth|env)$/,
            /(^|\/)clients(\/|$)/,
            /^server-only$/,
            /^next\/headers$/,
          ];
          return specifiers(sf)
            .filter((s) => banned.some((re) => re.test(s)))
            .map((s) => ({ target: s, message: `a client component must not import ${s}` }));
        }),
    },
    {
      id: "workflow-header",
      description:
        "An action or route that sequences two or more modules documents the four workflow questions",
      nonNegotiable: 9,
      async check(ctx) {
        const analyze = (sf: ts.SourceFile, file: FileInfo): Problem[] => {
          const touched = new Set(
            specifiers(sf)
              .map((s) => /\/modules\/([^/]+)\//.exec(s)?.[1])
              .filter(Boolean),
          );
          if (touched.size < 2) return [];
          const missing = [
            "@workflow",
            "retry-safe:",
            "duplicates:",
            "recovery:",
            "survives-restart:",
          ].filter((k) => !file.content.includes(k));
          return missing.map((k) => ({ target: k, message: `workflow header is missing ${k}` }));
        };
        const results = await Promise.all(
          ["route.ts", "actions.ts"].map((name) =>
            content(ctx, "workflow-header", { path: `${src}/app/**/${name}` }, analyze),
          ),
        );
        return results.flat();
      },
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

export const findingKey = (f: Finding) => `${f.rule}|${f.file}|${f.target}`;

export async function runAll(ctx: Ctx): Promise<Finding[]> {
  const rules = buildRules(ctx.arch);
  const all = (await Promise.all(rules.map((r) => r.check(ctx)))).flat();
  return applyExemptions(ctx.arch, all);
}
