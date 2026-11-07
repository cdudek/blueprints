// The optional `layout` block of architecture.json: without it every path is the 1.0.0 default,
// with it the rules follow the folders it names. The proof is a small project written to a
// temporary folder, with modules in src/features instead of src/modules.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { layoutOf, moduleOf, type Architecture } from "../../scripts/arch/lib.mjs";
import { runAll, type Finding } from "./rules.ts";

const base: Architecture = {
  $schemaVersion: "1.1.0",
  version: 1,
  srcRoot: "src",
  doors: { "public.ts": "browser", "server.ts": "server" },
  roots: [],
  modules: { orders: { description: "orders" } },
  edges: [],
  tables: {},
  readExceptions: [],
  exemptions: [],
  clients: [],
  serverOnlyPackages: ["server-only"],
  rulesMayImport: [],
};

describe("layout defaults", () => {
  it("are the 1.0.0 paths when the block is absent", () => {
    expect(layoutOf(base)).toEqual({
      app: "app",
      modules: "modules",
      ui: "ui",
      shared: "shared",
      db: "db",
      clients: "clients",
      dbClient: "db/index.ts",
      schemaRoot: "db/schema.ts",
      serverShared: ["shared/auth.ts", "shared/env.ts", "shared/access.ts"],
      resultFile: "shared/result.ts",
      workflows: "app/_workflows",
      compositionFolders: ["_shell", "_components"],
      worker: "worker.ts",
      providers: "app/_shell/providers.tsx",
      i18n: "i18n",
    });
  });

  it("keep every key the block leaves out", () => {
    const l = layoutOf({ ...base, layout: { modules: "features" } });
    expect(l.modules).toBe("features");
    expect(l.app).toBe("app");
    expect(moduleOf({ ...base, layout: { modules: "features" } }, "src/features/x/a.ts")).toBe("x");
    expect(moduleOf(base, "src/features/x/a.ts")).toBeNull();
  });
});

describe("a project with its modules in src/features", () => {
  const root = mkdtempSync(join(tmpdir(), "layout-"));
  const arch: Architecture = { ...base, layout: { modules: "features" } };
  const files: Record<string, string> = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "esnext",
        moduleResolution: "bundler",
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src"],
    }),
    "src/features/orders/public.ts": 'export type { Order } from "./order.types";\n',
    "src/features/orders/server.ts": 'import "server-only";\n\nexport {};\n',
    "src/features/orders/order.types.ts": "export type Order = { id: string };\n",
    "src/features/orders/order.repository.ts":
      "export const findOrder = (id: string) => ({ id });\n",
    "src/app/page.ts":
      'import { findOrder } from "@/features/orders/order.repository";\n\nexport const page = () => findOrder("1");\n',
  };
  let findings: Finding[] = [];
  beforeAll(async () => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    findings = await runAll({ arch, tsconfig: join(root, "tsconfig.json"), root });
  });
  const keys = () => findings.map((f) => `${f.rule} ${f.file} ${f.target}`);

  it("treats src/features/<name> as the module folder", () => {
    expect(keys().filter((k) => k.startsWith("roots-classified"))).toEqual([]);
    expect(findings.filter((f) => f.message.includes("not in architecture.json"))).toEqual([]);
  });

  it("enforces the doors in the moved folder", () => {
    expect(keys()).toContain(
      "module-doors src/app/page.ts src/features/orders/order.repository.ts",
    );
  });

  it("reports a role that selects no file, so a rule over it cannot pass by checking nothing", () => {
    expect(keys()).toContain("modules-declared architecture.json role:rules");
    expect(keys()).not.toContain("modules-declared architecture.json role:repository");
  });
});
