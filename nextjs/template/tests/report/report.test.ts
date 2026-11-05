// Report only. Writes the coupling metrics and the dependency graph as HTML for CI to upload.
// Nothing here can fail a build: numbers feed a human, not a gate (D8).
import { metrics, projectGraph } from "archunit";
import { it } from "vitest";

const tsconfig = "tsconfig.arch.json";

it("writes the coupling metrics report", async () => {
  // instability, abstractness and distance from the main sequence, per folder
  await metrics(tsconfig).distance().exportAsHTML("reports/archunit/distance-metrics.html", {
    title: "Coupling metrics (report only)",
    includeTimestamp: true,
  });
  await metrics(tsconfig)
    .count()
    .exportAsHTML("reports/archunit/count-metrics.html", { title: "Size metrics (report only)" });
});

it("writes the dependency graph", async () => {
  const graph = projectGraph(tsconfig).titled("Module dependencies");
  await graph.collapseToFolderDepth(3).exportAsHTML("reports/archunit/dependency-graph.html");
  await graph.collapseToFolderDepth(3).exportAsMermaid("reports/archunit/dependency-graph.mmd");
});
