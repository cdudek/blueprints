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

/** String-literal statements at the very top of a statement list: the directive prologue. */
function prologue(statements: readonly ts.Statement[]): string[] {
  const found: string[] = [];
  for (const s of statements) {
    if (ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression))
      found.push(s.expression.text);
    else break;
  }
  return found;
}

/**
 * True when the file has the directive in a real directive prologue: at the top of the file, or
 * at the top of a function body (inline "use server"). A string statement anywhere else is just a string.
 */
export function hasDirective(sf: ts.SourceFile, directive: string): boolean {
  let found = prologue(sf.statements).includes(directive);
  walk(sf, (n) => {
    if (
      (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) &&
      n.body &&
      ts.isBlock(n.body)
    ) {
      if (prologue(n.body.statements).includes(directive)) found = true;
    }
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

/** True when `id` is a reference to a binding, not a property name, a declaration name or a type. */
export function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (!p) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isPropertySignature(p) || ts.isMethodSignature(p)) return false;
  if (ts.isTypeReferenceNode(p) || ts.isQualifiedName(p) || ts.isTypeQueryNode(p)) return false;
  if (
    (ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isBindingElement(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isImportSpecifier(p) ||
      ts.isImportClause(p) ||
      ts.isNamespaceImport(p) ||
      ts.isExportSpecifier(p)) &&
    (p as { name?: ts.Node }).name === id
  ) {
    return false;
  }
  return true;
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

/** Identifier names referenced inside a node. */
export function identifiersIn(node: ts.Node): Set<string> {
  const names = new Set<string>();
  walk(node, (n) => {
    if (ts.isIdentifier(n)) names.add(n.text);
  });
  return names;
}
