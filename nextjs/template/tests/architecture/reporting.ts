// Failure messages name `file:line`, so an editor jumps to the violation. The baseline key keeps
// no line number, so an edit elsewhere in the file does not churn it.
import ts from "typescript";
import { walk } from "./ast.ts";
import type { Graph } from "./graph.ts";
import type { Finding } from "./rules.ts";

/** The 1-based line of the first node that names the finding's target; 1 for a file-level one. */
export function lineOf(graph: Graph, finding: Finding): number {
  const sf = graph.sources.get(finding.file);
  if (!sf || !finding.target) return 1;
  let line = 0;
  walk(sf, (node) => {
    if (line) return;
    const names =
      (ts.isStringLiteralLike(node) &&
        (node.text === finding.target ||
          graph.resolve(node.text, finding.file) === finding.target)) ||
      ((ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) &&
        node.getText(sf) === finding.target);
    if (names) line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  });
  return line || 1;
}

/** One line per finding: `rule file:line: message (target)`. */
export const located = (graph: Graph, findings: Finding[]) =>
  findings.map((f) => `${f.rule} ${f.file}:${lineOf(graph, f)}: ${f.message} (${f.target})`);
