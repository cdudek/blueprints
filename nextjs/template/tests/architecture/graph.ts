// A dependency graph resolved through TypeScript (tsconfig paths included), that sees what
// ArchUnitTS' import-only graph cannot: `export … from`, literal dynamic import(), require(),
// and a split between runtime edges and erased type edges. Used for the rules that need the
// whole picture: cycles, what a client component or a public door can reach, rules purity.
import { dirname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { walk } from "./ast";

type EdgeForm = "import" | "export-from" | "dynamic" | "require";
export type Edge = {
  from: string;
  /** A project file (relative, posix) or, when external, the package or builtin name. */
  to: string;
  external: boolean;
  /** Type edges are erased at build time and never load code. */
  kind: "runtime" | "type";
  form: EdgeForm;
  specifier: string;
};
type Problem = { file: string; message: string };
export type Graph = {
  root: string;
  files: string[];
  edges: Edge[];
  problems: Problem[];
  sources: Map<string, ts.SourceFile>;
  /** Resolves a specifier written in `file` to a project file, or null. */
  resolve: (specifier: string, file: string) => string | null;
};

const posix = (p: string) => p.split("\\").join("/");

export function buildGraph(tsconfig: string, root: string): Graph {
  const read = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(tsconfig));
  const options = parsed.options;
  const rel = (p: string) => posix(isAbsolute(p) ? relative(root, p) : p);

  const files = parsed.fileNames.map(rel).filter((f) => !f.includes("node_modules"));
  const sources = new Map<string, ts.SourceFile>();
  for (const f of files) {
    const text = readFileSync(resolve(root, f), "utf8");
    sources.set(
      f,
      ts.createSourceFile(
        f,
        text,
        ts.ScriptTarget.Latest,
        true,
        f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    );
  }

  const fileSet = new Set(files);
  const resolveSpec = (specifier: string, file: string): { to: string; external: boolean } => {
    const found = ts.resolveModuleName(
      specifier,
      resolve(root, file),
      options,
      ts.sys,
    ).resolvedModule;
    if (found && !found.isExternalLibraryImport) {
      const target = rel(found.resolvedFileName);
      if (fileSet.has(target) || !target.includes("node_modules"))
        return { to: target, external: false };
    }
    return { to: specifier, external: true };
  };

  const edges: Edge[] = [];
  const problems: Problem[] = [];
  const add = (file: string, specifier: string, kind: Edge["kind"], form: EdgeForm) => {
    const r = resolveSpec(specifier, file);
    edges.push({ from: file, to: r.to, external: r.external, kind, form, specifier });
  };

  for (const [file, sf] of sources) {
    walk(sf, (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const c = n.importClause;
        const named = c?.namedBindings;
        const typeOnly =
          !!c?.isTypeOnly ||
          (!!c &&
            !c.name &&
            !!named &&
            ts.isNamedImports(named) &&
            named.elements.length > 0 &&
            named.elements.every((e) => e.isTypeOnly));
        add(file, n.moduleSpecifier.text, typeOnly ? "type" : "runtime", "import");
      } else if (
        ts.isExportDeclaration(n) &&
        n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      ) {
        const clause = n.exportClause;
        const typeOnly =
          n.isTypeOnly ||
          (!!clause &&
            ts.isNamedExports(clause) &&
            clause.elements.length > 0 &&
            clause.elements.every((e) => e.isTypeOnly));
        add(file, n.moduleSpecifier.text, typeOnly ? "type" : "runtime", "export-from");
      } else if (
        ts.isImportTypeNode(n) &&
        ts.isLiteralTypeNode(n.argument) &&
        ts.isStringLiteral(n.argument.literal)
      ) {
        add(file, n.argument.literal.text, "type", "import");
      } else if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const [arg] = n.arguments;
        if (callee.kind === ts.SyntaxKind.ImportKeyword) {
          if (arg && ts.isStringLiteralLike(arg)) add(file, arg.text, "runtime", "dynamic");
          else
            problems.push({
              file,
              message: "non-literal dynamic import(): its target cannot be analysed",
            });
        } else if (
          ts.isIdentifier(callee) &&
          callee.text === "require" &&
          arg &&
          ts.isStringLiteralLike(arg)
        ) {
          add(file, arg.text, "runtime", "require");
        }
      }
    });
  }

  return {
    root,
    files,
    edges,
    problems,
    sources,
    resolve: (s, f) => {
      const r = resolveSpec(s, f);
      return r.external ? null : r.to;
    },
  };
}

/** Everything reachable from `roots` over edges accepted by `follow`, with the path that got there. */
export function reach(
  graph: Graph,
  roots: string[],
  follow: (e: Edge) => boolean = (e) => e.kind === "runtime",
) {
  const out = new Map<string, Edge[]>();
  for (const e of graph.edges)
    if (follow(e)) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e);
  const parent = new Map<string, { via: string; edge: Edge }>();
  const seen = new Set<string>(roots);
  const queue = [...roots];
  const reached: { node: string; external: boolean; root: string; path: string[] }[] = [];
  const pathTo = (node: string): string[] => {
    const path = [node];
    for (let cur = node; parent.has(cur);) {
      cur = parent.get(cur)!.via;
      path.unshift(cur);
    }
    return path;
  };
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of out.get(cur) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      parent.set(e.to, { via: cur, edge: e });
      const path = pathTo(e.to);
      reached.push({ node: e.to, external: e.external, root: path[0] ?? cur, path });
      if (!e.external) queue.push(e.to);
    }
  }
  return reached;
}

/** Strongly connected components with more than one file (or a self-import). */
export function cycles(graph: Graph): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const e of graph.edges)
    if (!e.external) (adj.get(e.from) ?? adj.set(e.from, new Set()).get(e.from)!).add(e.to);
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1 || adj.get(v)?.has(v)) result.push(component.sort());
    }
  };
  for (const v of adj.keys()) if (!idx.has(v)) strong(v);
  return result;
}
