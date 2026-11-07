// Writes a Mermaid diagram of architecture.json (modules, declared edges, table owners) into
// docs/architecture.md between the markers. `--check` fails when the committed diagram is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadArchitecture, moduleOf } from "./lib.mjs";

const START = "<!-- architecture-diagram:start -->";
const END = "<!-- architecture-diagram:end -->";

/** @param {import("./lib.mjs").Architecture} arch */
export function renderDiagram(arch) {
  const ownedBy = (/** @type {string} */ m) =>
    Object.entries(arch.tables)
      .filter(([, owner]) => owner === m)
      .map(([table]) => table);
  const lines = ["flowchart LR"];
  for (const [name, { description }] of Object.entries(arch.modules)) {
    const tables = ownedBy(name);
    const label = [
      `<b>${name}</b>`,
      description,
      tables.length ? `tables: ${tables.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("<br/>");
    lines.push(`  ${name}["${label}"]`);
  }
  // an edge covers both doors: calling server.ts and importing public.ts
  for (const e of arch.edges) lines.push(`  ${e.from} -->|uses a door| ${e.to}`);
  for (const x of arch.readExceptions)
    lines.push(`  ${moduleOf(arch, x.file)} -.->|reads ${x.table}| ${arch.tables[x.table]}`);
  for (const c of arch.clients) lines.push(`  client_${c}[("client: ${c}")]:::port`);
  lines.push("  classDef port stroke-dasharray: 4 2");
  return ["```mermaid", ...lines, "```"].join("\n");
}

/** @param {string} doc @param {string} diagram */
export function embed(doc, diagram) {
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  if (a < 0 || b < a) throw new Error(`docs/architecture.md needs the ${START} and ${END} markers`);
  return `${doc.slice(0, a + START.length)}\n${diagram}\n${doc.slice(b)}`;
}

// a URL comparison, so a path with spaces or other escaped characters still runs the script
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const file = "docs/architecture.md";
  const current = readFileSync(file, "utf8");
  const next = embed(current, renderDiagram(loadArchitecture()));
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error(
        "docs/architecture.md diagram is stale: run `pnpm arch:diagram` and commit the result",
      );
      process.exit(1);
    }
    console.log("architecture diagram is up to date");
  } else {
    writeFileSync(file, next);
    console.log("architecture diagram written to docs/architecture.md");
  }
}
