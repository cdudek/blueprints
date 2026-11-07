// The generated diagram: what it draws, and that its --check runs from any path.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDiagram } from "../../scripts/arch/diagram.mjs";
import { loadArchitecture } from "../../scripts/arch/lib.mjs";

const root = resolve(__dirname, "../..");
const arch = loadArchitecture(root);

describe("architecture diagram", () => {
  it("labels an edge as using a door, and draws a read exception from its file's module", () => {
    const diagram = renderDiagram({
      ...arch,
      readExceptions: [
        {
          file: "src/modules/billing/report.ts",
          table: "orders",
          reason: "a billing report reads orders",
        },
      ],
    });
    expect(diagram).toContain("orders -->|uses a door| billing");
    expect(diagram).toContain("billing -.->|reads orders| orders");
    expect(diagram).not.toContain("undefined");
  });

  it("fails --check on a stale diagram, also from a folder whose path has a space", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "diagram-")), "with space");
    mkdirSync(join(dir, "docs"), { recursive: true });
    cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
    cpSync(join(root, "architecture.json"), join(dir, "architecture.json"));
    writeFileSync(
      join(dir, "docs/architecture.md"),
      "<!-- architecture-diagram:start -->\nstale\n<!-- architecture-diagram:end -->\n",
    );
    const run = spawnSync(process.execPath, ["scripts/arch/diagram.mjs", "--check"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(run.status, run.stdout + run.stderr).toBe(1);
    expect(run.stderr).toContain("diagram is stale");
  });
});
