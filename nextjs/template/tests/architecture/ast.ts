// Content rules read the syntax tree, not text, so comments and strings cannot fool them.
// ArchUnitTS sees only top-level `import … from`; these helpers also see `export … from`,
// dynamic `import()` and `require()`, and anything in node_modules.
import ts from "typescript";

export function parse(path: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Every module specifier: import, export-from, import("x"), require("x"). */
export function specifiers(sf: ts.SourceFile): string[] {
  const found: string[] = [];
  walk(sf, (n) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      found.push(n.moduleSpecifier.text);
    } else if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      const [arg] = n.arguments;
      if ((isImport || isRequire) && arg && ts.isStringLiteralLike(arg)) found.push(arg.text);
    }
  });
  return found;
}

/** True when the file carries the directive ("use client", "use server") anywhere. */
export function hasDirective(sf: ts.SourceFile, directive: string): boolean {
  let found = false;
  walk(sf, (n) => {
    if (
      ts.isExpressionStatement(n) &&
      ts.isStringLiteral(n.expression) &&
      n.expression.text === directive
    )
      found = true;
  });
  return found;
}

/** `import "server-only"` as a bare side-effect import. */
export function importsServerOnly(sf: ts.SourceFile): boolean {
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      !s.importClause &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === "server-only",
  );
}

/** Member accesses such as Date.now, Math.random, process.env. */
export function usesMember(sf: ts.SourceFile, object: string, property: string): boolean {
  let found = false;
  walk(sf, (n) => {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === object &&
      n.name.text === property
    )
      found = true;
  });
  return found;
}

export function usesNewDateWithoutArguments(sf: ts.SourceFile): boolean {
  let found = false;
  walk(sf, (n) => {
    if (
      ts.isNewExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "Date" &&
      (n.arguments?.length ?? 0) === 0
    )
      found = true;
  });
  return found;
}

/** pgTable("name", …) calls: the table names a file defines. */
export function definedTables(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "pgTable"
    ) {
      const [first] = n.arguments;
      if (first && ts.isStringLiteralLike(first)) names.push(first.text);
    }
  });
  return names;
}

/** Exported function names in a file, with their bodies, for `export function f` and `export const f = () =>`. */
export function exportedFunctions(sf: ts.SourceFile): { name: string; node: ts.Node }[] {
  const out: { name: string; node: ts.Node }[] = [];
  const exported = (n: ts.Node) =>
    ts.canHaveModifiers(n) &&
    ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name && exported(s))
      out.push({ name: s.name.text, node: s });
    if (ts.isVariableStatement(s) && exported(s)) {
      for (const d of s.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ) {
          out.push({ name: d.name.text, node: d.initializer });
        }
      }
    }
  }
  return out;
}

export function callsFunction(node: ts.Node, names: string[]): boolean {
  let found = false;
  walk(node, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      names.includes(n.expression.text)
    )
      found = true;
  });
  return found;
}

/** Local names bound by imports whose specifier satisfies `match`. */
export function importedBindings(
  sf: ts.SourceFile,
  match: (specifier: string) => boolean,
): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !s.importClause)
      continue;
    const spec = s.moduleSpecifier.text;
    if (!match(spec)) continue;
    const { name, namedBindings } = s.importClause;
    if (name) bindings.set(name.text, spec);
    if (namedBindings && ts.isNamespaceImport(namedBindings))
      bindings.set(namedBindings.name.text, spec);
    if (namedBindings && ts.isNamedImports(namedBindings))
      for (const el of namedBindings.elements) bindings.set(el.name.text, spec);
  }
  return bindings;
}

/** `db.transaction(cb)` callbacks (any `<x>.transaction(...)` call). */
export function transactionCallbacks(sf: ts.SourceFile): ts.Node[] {
  const callbacks: ts.Node[] = [];
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "transaction"
    ) {
      for (const arg of n.arguments)
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) callbacks.push(arg);
    }
  });
  return callbacks;
}

/** Identifier names referenced inside a node. */
export function identifiersIn(node: ts.Node): Set<string> {
  const names = new Set<string>();
  walk(node, (n) => {
    if (ts.isIdentifier(n)) names.add(n.text);
  });
  return names;
}
