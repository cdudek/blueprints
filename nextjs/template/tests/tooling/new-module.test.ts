// The generator's output must satisfy every gate the template enforces: scaffold a module in a
// temporary copy of the template, then run type check, lint, unit tests and the architecture suite.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const run = (cwd: string, cmd: string, args: string[]) =>
  spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, CI: "" } });

describe("pnpm new:module", () => {
  const copy = mkdtempSync(join(tmpdir(), "blueprint-"));
  const rsync = run(root, "rsync", [
    "-a",
    "--exclude",
    "node_modules",
    "--exclude",
    ".next",
    "--exclude",
    "reports",
    "--exclude",
    ".vitest",
    "--exclude",
    "test-results",
    "--exclude",
    "tests/fixtures/arch-violations",
    ".",
    `${copy}/`,
  ]);

  it("copies the template", () => {
    expect(rsync.status).toBe(0);
    symlinkSync(join(root, "node_modules"), join(copy, "node_modules"));
  });

  it("scaffolds a module that passes lint, types, unit tests and the architecture suite", () => {
    const node = process.execPath;
    const made = run(copy, node, ["scripts/arch/new-module.mjs", "shipments"]);
    expect(made.status, made.stderr).toBe(0);
    for (const f of [
      "public.ts",
      "server.ts",
      "shipment.service.ts",
      "shipment.repository.ts",
      "shipment.rules.ts",
      "shipment.rules.test.ts",
      "shipment.schema.ts",
      "shipment.types.ts",
      "shipment.tables.ts",
      "components/ShipmentList.tsx",
    ]) {
      expect(existsSync(join(copy, "src/modules/shipments", f)), f).toBe(true);
    }
    expect(JSON.parse(readFileSync(join(copy, "architecture.json"), "utf8")).tables.shipments).toBe(
      "shipments",
    );
    expect(readFileSync(join(copy, "src/db/schema.ts"), "utf8")).toContain("shipments");

    const bin = (name: string) => join(copy, "node_modules/.bin", name);
    for (const [cmd, args] of [
      [bin("prettier"), ["--write", "src", "architecture.json", "docs"]],
      [bin("tsc"), ["--noEmit"]],
      [bin("eslint"), ["src"]],
      [bin("vitest"), ["run", "src/modules/shipments"]],
      [bin("vitest"), ["run", "--config", "vitest.arch.config.ts", "architecture.test"]],
      [node, ["scripts/arch/diagram.mjs", "--check"]],
    ] as [string, string[]][]) {
      const result = run(copy, cmd, args);
      expect(result.status, `${cmd} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0);
    }
  }, 120_000);

  it("refuses a name that exists", () => {
    expect(run(copy, process.execPath, ["scripts/arch/new-module.mjs", "orders"]).status).toBe(1);
  });
});
