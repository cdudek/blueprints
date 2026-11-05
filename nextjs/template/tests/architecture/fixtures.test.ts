// Proof that the rules work: a deliberate violation per rule, in a project the normal run
// never touches. Every check must FAIL on its fixture. A rule without a fixture fails here too.
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadArchitecture } from "../../scripts/arch/lib.mjs";
import { buildRules, runAll, type Finding } from "./rules";

const root = resolve(__dirname, "../fixtures/arch-violations");
const arch = loadArchitecture(root);
let findings: Finding[] = [];

beforeAll(async () => {
  findings = await runAll({ arch, tsconfig: resolve(root, "tsconfig.json"), root });
});

/** rule id -> violations that must be reported, as [file, target]. */
const expected: Record<string, [file: string, target: string][]> = {
  "no-cycles": [
    [
      "src/modules/orders/cycle-a.ts",
      "src/modules/orders/cycle-a.ts -> src/modules/orders/cycle-b.ts",
    ],
  ],
  "module-doors": [
    ["src/app/alias-door.ts", "src/modules/billing/billing.service.ts"], // alias import
    ["src/modules/orders/relative-door.ts", "src/modules/billing/billing.service.ts"], // relative import
    ["src/shared/bridge.ts", "src/modules/billing/billing.service.ts"], // indirect: caught at the helper
  ],
  "declared-edges": [["src/modules/billing/uses-orders.ts", "src/modules/orders/server.ts"]],
  "modules-declared": [
    ["src/modules/ghost/public.ts", "ghost"],
    ["architecture.json", "phantom"],
  ],
  "rules-pure-imports": [
    ["src/modules/orders/bad-imports.rules.ts", "src/modules/orders/order.repository.ts"],
    ["src/modules/orders/bad-imports.rules.ts", "src/modules/orders/order.service.ts"],
    ["src/modules/orders/bad-imports.rules.ts", "src/shared/db.ts"],
    ["src/modules/orders/bad-imports.rules.ts", "src/app/page.tsx"],
  ],
  "rules-pure-content": [
    ["src/modules/orders/impure.rules.ts", "react"],
    ["src/modules/orders/impure.rules.ts", "next/headers"], // a re-export: invisible to ArchUnitTS imports
    ["src/modules/orders/impure.rules.ts", "next/cache"], // a dynamic import
    ["src/modules/orders/impure.rules.ts", "process.env"],
    ["src/modules/orders/impure.rules.ts", "Date.now"],
    ["src/modules/orders/impure.rules.ts", "Math.random"],
    ["src/modules/orders/impure.rules.ts", "new Date()"],
  ],
  "ui-no-modules": [["src/ui/BadButton.tsx", "src/modules/orders/public.ts"]],
  "ui-no-server": [
    ["src/ui/ServerThing.tsx", "src/shared/db.ts"],
    ["src/ui/ServerThing.tsx", "src/clients/payments/index.ts"],
    ["src/ui/ServerThing.tsx", "server-only"],
  ],
  "shared-no-modules": [["src/shared/leak.ts", "src/modules/orders/public.ts"]],
  "nothing-imports-app": [["src/modules/orders/imports-app.ts", "src/app/page.tsx"]],
  "components-no-persistence": [
    ["src/modules/orders/components/BadList.tsx", "src/modules/orders/order.repository.ts"],
    ["src/modules/orders/components/BadList.tsx", "src/modules/orders/order.tables.ts"],
    ["src/modules/orders/components/BadList.tsx", "src/shared/db.ts"],
  ],
  "tables-owner-only": [
    ["src/app/reads-orders-table.ts", "src/modules/orders/order.tables.ts"],
    ["src/modules/billing/reads-orders-table.ts", "src/modules/orders/order.tables.ts"],
  ],
  "table-owners-match": [
    ["src/modules/ledger/ledger.tables.ts", "entries"], // defined, never declared
    ["src/modules/billing/billing.tables.ts", "invoices"], // declared as owned by orders
    ["architecture.json", "ghosts"], // declared, defined nowhere
  ],
  "providers-in-client-folder": [
    ["src/modules/billing/direct-provider.ts", "src/clients/payments/providers/real.ts"],
  ],
  "use-server-only-in-app": [["src/modules/orders/actions.ts", "use server"]],
  "app-no-persistence": [
    ["src/app/bad-actions.ts", "src/modules/orders/order.repository.ts"],
    ["src/app/bad-actions.ts", "src/shared/db.ts"],
  ],
  "service-authenticates": [
    ["src/modules/ledger/ledger.service.ts", "listEntries"],
    ["src/modules/ledger/ledger.service.ts", "addEntry"],
  ],
  "no-external-in-transaction": [
    ["src/modules/ledger/ledger.tx.service.ts", "payments"],
    ["src/modules/ledger/ledger.tx.service.ts", "fetch"],
  ],
  "server-only-in-server-files": [
    ["src/modules/ledger/server.ts", "server-only"],
    ["src/modules/ledger/ledger.service.ts", "server-only"],
  ],
  "public-door-browser-safe": [
    ["src/modules/ledger/public.ts", "src/modules/ledger/ledger.service.ts"],
  ],
  "client-components-public-only": [
    ["src/modules/orders/components/BadClient.tsx", "@/modules/billing/server"],
    ["src/modules/orders/components/BadClient.tsx", "../order.service"], // a re-export
    ["src/modules/orders/components/BadClient.tsx", "@/shared/db"], // a dynamic import
  ],
  "workflow-header": [
    ["src/app/api/bad/route.ts", "@workflow"],
    ["src/app/api/bad/route.ts", "retry-safe:"],
    ["src/app/api/bad/route.ts", "survives-restart:"],
  ],
};

describe("every rule has a deliberate-violation fixture", () => {
  it("lists every rule id", () => {
    expect(Object.keys(expected).sort()).toEqual(
      buildRules(arch)
        .map((r) => r.id)
        .sort(),
    );
  });
});

describe("every rule rejects its fixture", () => {
  for (const [rule, cases] of Object.entries(expected)) {
    it.each(cases)(`${rule}: %s -> %s`, (file, target) => {
      const hit = findings.some((f) => f.rule === rule && f.file === file && f.target === target);
      expect(hit, `expected ${rule} to flag ${file} (${target})`).toBe(true);
    });
  }
});

describe("what ArchUnitTS cannot see (and eslint-plugin-boundaries covers)", () => {
  // ArchUnitTS reads only top-level `import … from`. If a future release sees these, the test
  // fails and this limitation note can go.
  const seen = (file: string) => findings.some((f) => f.rule === "module-doors" && f.file === file);

  it("misses a re-export between project files", () => {
    expect(seen("src/modules/orders/reexport.ts")).toBe(false);
  });
  it("misses a dynamic import between project files", () => {
    expect(seen("src/modules/orders/dynamic.ts")).toBe(false);
  });
  it("flags the helper, not its caller, for an indirect import", () => {
    expect(seen("src/shared/bridge.ts")).toBe(true);
    expect(seen("src/modules/orders/via-helper.ts")).toBe(false);
  });
});
