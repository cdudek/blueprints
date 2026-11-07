// Proof that the rules work: deliberate violations, in a project the normal run never touches.
// Each violation file must be flagged by the INTENDED rules and no others (so another failure
// cannot mask the one under test), every other file is a positive control and must be clean,
// and each rule must report its specific diagnostic, not merely "some error".
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadArchitecture } from "../../scripts/arch/lib.mjs";
import { buildGraph } from "./graph.ts";
import { lineOf, located } from "./reporting.ts";
import { buildRules, runAll, type Finding } from "./rules.ts";

const root = resolve(__dirname, "../fixtures/arch-violations");
const arch = loadArchitecture(root);
const ctxOf = (a = arch) => ({ arch: a, tsconfig: resolve(root, "tsconfig.json"), root });
let findings: Finding[] = [];

beforeAll(async () => {
  findings = await runAll(ctxOf());
});

const rulesFor = (file: string) =>
  [...new Set(findings.filter((f) => f.file === file).map((f) => f.rule))].sort();

/** file -> the rules that must flag it, and only them. */
const intended: Record<string, string[]> = {
  "architecture.json": ["declared-edges-acyclic", "modules-declared", "table-definitions-declared"],
  "src/app/alias-door.ts": ["module-doors"],
  "src/app/api/bad/route.ts": ["workflow-header"],
  "src/app/bad-action.ts": ["system-operations-from-routes-only"],
  "src/app/bad-actions.ts": ["app-no-persistence", "module-doors"],
  "src/app/ns.ts": ["system-operations-from-routes-only"],
  "src/app/reads-orders-table.ts": ["app-no-persistence", "tables-owner-only"],
  "src/db/schema.ts": ["schema-composition"],
  "src/escape.ts": ["module-doors-complete", "roots-classified"],
  "src/modules/billing/direct-provider.ts": ["providers-in-client-folder"],
  "src/modules/billing/dyn-edge.ts": ["declared-edges-complete"],
  "src/modules/billing/reads-orders-table.ts": ["declared-edges", "tables-owner-only"],
  "src/modules/billing/uses-orders.ts": ["declared-edges"],
  "src/modules/ghost/public.ts": ["modules-declared", "roots-classified"],
  "src/modules/half/server.ts": ["modules-declared"],
  "src/modules/ledger/ledger.service.ts": ["access-declared", "server-only-in-server-files"],
  "src/modules/ledger/ledger.tables.ts": ["table-definitions-declared"],
  "src/modules/ledger/ledger.tx.service.ts": ["access-declared", "transaction-discipline"],
  "src/modules/ledger/public.ts": ["door-exports", "public-door-closure"],
  "src/modules/ledger/server.ts": ["door-exports", "server-only-in-server-files"],
  "src/modules/orders/actions.ts": ["use-server-only-in-app"],
  "src/modules/orders/bad-imports.rules.ts": [
    "nothing-imports-app",
    "rules-pure-closure",
    "rules-pure-imports",
  ],
  "src/modules/orders/components/AliasClient.tsx": ["client-runtime-closure"],
  "src/modules/orders/components/BadClient.tsx": ["client-runtime-closure"],
  "src/modules/orders/components/BadList.tsx": ["components-no-persistence"],
  "src/modules/orders/components/SecretClient.tsx": ["client-runtime-closure"],
  "src/modules/orders/components/TransitiveClient.tsx": ["client-runtime-closure"],
  "src/modules/orders/cycle-a.ts": ["no-cycles", "no-cycles-complete"],
  "src/modules/orders/dyn-nonliteral.ts": ["no-dynamic-nonliteral"],
  "src/modules/orders/dyn-repo.rules.ts": ["rules-pure-closure"],
  "src/modules/orders/dynamic.ts": ["module-doors-complete"],
  "src/modules/orders/helper-tx.ts": ["transaction-discipline"],
  "src/modules/orders/imports-app.ts": ["nothing-imports-app"],
  "src/modules/orders/impure.rules.ts": ["rules-pure-closure", "rules-pure-content"],
  "src/modules/orders/indirect.rules.ts": ["rules-pure-closure"],
  "src/modules/orders/late.repository.ts": ["server-only-in-server-files"],
  "src/modules/orders/order.admin.service.ts": ["system-operations-from-routes-only"],
  "src/modules/orders/reads-payments-bad.ts": ["tables-owner-only"],
  "src/modules/orders/reads-payments-ok.ts": ["tables-owner-only"],
  "src/modules/orders/recyc-a.ts": ["no-cycles-complete"],
  "src/modules/orders/reexport.ts": ["module-doors-complete"],
  "src/modules/orders/relative-door.ts": ["module-doors"],
  "src/shared/bridge.ts": ["module-doors", "shared-no-modules"],
  "src/shared/leak.ts": ["shared-no-modules"],
  "src/ui/BadButton.tsx": ["ui-no-modules"],
  "src/ui/ServerThing.tsx": ["ui-no-server"],
};

describe("each violation is flagged by its intended rules only", () => {
  it.each(Object.entries(intended))("%s", (file, rules) => {
    expect(rulesFor(file)).toEqual([...rules].sort());
  });
});

describe("positive controls: everything else is clean", () => {
  it("flags no file outside the intended list", () => {
    const stray = findings
      .filter((f) => !(f.file in intended))
      .map((f) => `${f.rule} ${f.file} ${f.target}`);
    expect(stray).toEqual([]);
  });

  // the legitimate twin of a violation, to show the rule is not just flagging everything
  it.each([
    [
      "src/modules/orders/components/GoodClient.tsx",
      "an erased `import type` from a server door, and NEXT_PUBLIC_ env, in a client file",
    ],
    [
      "src/modules/orders/not-a-directive.ts",
      'a "use server" string that is not a directive prologue',
    ],
    [
      "src/modules/orders/via-helper.ts",
      "an indirect import: the violation is located at the helper",
    ],
    ["src/app/api/hook/route.ts", "a route handler calling a system (webhook) operation"],
    [
      "src/modules/orders/order.service.ts",
      "a user operation using inTransaction and passing tx to billing",
    ],
    [
      "src/modules/billing/billing.service.ts",
      "a service with user and webhook operations and a Tx-taking operation",
    ],
    ["src/db/index.ts", "the one place db.transaction is allowed"],
    ["src/app/place/PlaceButton.tsx", 'a client file importing a "use server" action'],
    ["src/app/place/actions.ts", 'a "use server" file reaching a server door'],
  ])("%s (%s)", (file) => {
    expect(rulesFor(file)).toEqual([]);
  });
});

/** rule -> [file, target substring, message substring] it must report. */
const specific: [string, string, string, string][] = [
  [
    "module-doors",
    "src/app/alias-door.ts",
    "src/modules/billing/billing.service.ts",
    "Enter billing through",
  ],
  [
    "module-doors",
    "src/modules/orders/relative-door.ts",
    "src/modules/billing/billing.service.ts",
    "Enter billing through",
  ],
  [
    "module-doors-complete",
    "src/modules/orders/reexport.ts",
    "src/modules/billing/billing.service.ts",
    "export-from",
  ],
  [
    "module-doors-complete",
    "src/modules/orders/dynamic.ts",
    "src/modules/billing/billing.service.ts",
    "dynamic",
  ],
  [
    "declared-edges-complete",
    "src/modules/billing/dyn-edge.ts",
    "src/modules/orders/server.ts",
    "no declared edge",
  ],
  [
    "no-cycles-complete",
    "src/modules/orders/recyc-a.ts",
    "recyc-a.ts -> src/modules/orders/recyc-b.ts",
    "re-exports",
  ],
  ["no-dynamic-nonliteral", "src/modules/orders/dyn-nonliteral.ts", "import()", "non-literal"],
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "Date.now", "pass the time in"],
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "Math.random", "pass randomness in"],
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "process", "ambient global"],
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "fetch", "ambient global"],
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "node:crypto", "must not import"],
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "next/headers", "must not import"], // a re-export
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "next/cache", "must not import"], // a dynamic import
  ["rules-pure-content", "src/modules/orders/impure.rules.ts", "Date", "pass the time in"],
  [
    "rules-pure-closure",
    "src/modules/orders/indirect.rules.ts",
    "node:fs",
    "indirect.rules.ts -> src/modules/orders/impure-helper.ts -> node:fs",
  ],
  [
    "rules-pure-closure",
    "src/modules/orders/dyn-repo.rules.ts",
    "src/modules/orders/order.repository.ts",
    "may not reach",
  ],
  [
    "client-runtime-closure",
    "src/modules/orders/components/AliasClient.tsx",
    "src/modules/billing/server.ts",
    "a server door",
  ], // @billing-api alias
  [
    "client-runtime-closure",
    "src/modules/orders/components/TransitiveClient.tsx",
    "src/modules/billing/server.ts",
    "client-helper.ts -> src/modules/billing/server.ts",
  ],
  [
    "client-runtime-closure",
    "src/modules/orders/components/BadClient.tsx",
    "src/db/index.ts",
    "persistence",
  ], // dynamic import
  [
    "client-runtime-closure",
    "src/modules/orders/components/BadClient.tsx",
    "src/modules/orders/order.service.ts",
    "service",
  ], // re-export
  [
    "client-runtime-closure",
    "src/modules/orders/components/SecretClient.tsx",
    "process.env.DATABASE_URL",
    "non-public environment",
  ],
  [
    "public-door-closure",
    "src/modules/ledger/public.ts",
    "src/modules/ledger/ledger.repository.ts",
    "repository",
  ],
  [
    "door-exports",
    "src/modules/ledger/public.ts",
    "src/modules/ledger/ledger.repository.ts",
    "may not export",
  ],
  ["door-exports", "src/modules/ledger/public.ts", "renamed", "do not rename"],
  ["door-exports", "src/modules/ledger/server.ts", "export *", "no wildcard"],
  [
    "system-operations-from-routes-only",
    "src/app/bad-action.ts",
    "billing.settleFromWebhook",
    "route handler",
  ],
  ["system-operations-from-routes-only", "src/app/ns.ts", "billing.*", "by name"],
  [
    "system-operations-from-routes-only",
    "src/modules/orders/order.admin.service.ts",
    "billing.settleFromWebhook",
    "must not call",
  ],
  ["transaction-discipline", "src/modules/ledger/ledger.tx.service.ts", "pay", "external client"], // aliased import
  ["transaction-discipline", "src/modules/ledger/ledger.tx.service.ts", "fetch", "network call"],
  [
    "transaction-discipline",
    "src/modules/ledger/ledger.tx.service.ts",
    "chargeFn",
    "must receive the transaction",
  ],
  [
    "transaction-discipline",
    "src/modules/ledger/ledger.tx.service.ts",
    "transaction()",
    "single gateway",
  ],
  [
    "transaction-discipline",
    "src/modules/ledger/ledger.tx.service.ts",
    "inTransaction",
    "nested transaction",
  ],
  [
    "transaction-discipline",
    "src/modules/ledger/ledger.tx.service.ts",
    "inTransaction",
    "must not open its own",
  ],
  [
    "transaction-discipline",
    "src/modules/ledger/ledger.tx.service.ts",
    "inTransaction",
    "inline function or a function declared in the same file",
  ],
  [
    "transaction-discipline",
    "src/modules/orders/helper-tx.ts",
    "inTransaction",
    "only a service owns",
  ],
  [
    "access-declared",
    "src/modules/ledger/ledger.service.ts",
    "listEntries",
    "operation({ access }",
  ],
  ["table-definitions-declared", "src/modules/ledger/ledger.tables.ts", "entries", "not declared"],
  [
    "table-definitions-declared",
    "src/modules/ledger/ledger.tables.ts",
    "payments",
    "owned by billing but defined in ledger",
  ],
  ["table-definitions-declared", "architecture.json", "ghosts", "defined nowhere"],
  ["declared-edges-acyclic", "architecture.json", "ledger -> billing", "closes a cycle"],
  ["declared-edges-acyclic", "architecture.json", "billing -> ledger", "closes a cycle"],
  ["schema-composition", "src/db/schema.ts", "src/modules/ledger/ledger.tables.ts", "not composed"],
  [
    "tables-owner-only",
    "src/app/reads-orders-table.ts",
    "src/modules/orders/order.tables.ts",
    "Only orders imports its tables",
  ],
  [
    "modules-declared",
    "src/modules/half/server.ts",
    "src/modules/half/server.ts",
    "missing its door",
  ],
  ["modules-declared", "src/modules/ghost/public.ts", "ghost", "not in architecture.json"],
  ["roots-classified", "src/escape.ts", "escape.ts", "fits no declared root"],
  ["use-server-only-in-app", "src/modules/orders/actions.ts", "use server", "actions live in app"],
  ["server-only-in-server-files", "src/modules/ledger/server.ts", "server-only", "missing"],
  [
    "server-only-in-server-files",
    "src/modules/orders/late.repository.ts",
    "server-only",
    "must be the first statement",
  ],
  ["workflow-header", "src/app/api/bad/route.ts", "@workflow", "workflow header is missing"],
  ["ui-no-server", "src/ui/ServerThing.tsx", "server-only", "never imports server code"],
  ["ui-no-modules", "src/ui/BadButton.tsx", "src/modules/orders/public.ts", "no business nouns"],
  ["shared-no-modules", "src/shared/leak.ts", "src/modules/orders/public.ts", "stays generic"],
  [
    "components-no-persistence",
    "src/modules/orders/components/BadList.tsx",
    "src/modules/orders/order.repository.ts",
    "props",
  ],
  [
    "providers-in-client-folder",
    "src/modules/billing/direct-provider.ts",
    "src/clients/payments/providers/real.ts",
    "never a provider",
  ],
  ["app-no-persistence", "src/app/bad-actions.ts", "src/db/index.ts", "never persistence"],
];

describe("each rule reports its specific diagnostic", () => {
  it.each(specific)("%s: %s -> %s", (rule, file, target, text) => {
    const hit = findings.find(
      (f) =>
        f.rule === rule &&
        f.file === file &&
        f.target.includes(target) &&
        `${f.message} ${f.target}`.includes(text),
    );
    expect(hit, `${rule} should flag ${file} (${target}) with "${text}"`).toBeDefined();
  });
});

describe("failure messages name file:line", () => {
  const graph = buildGraph(resolve(root, "tsconfig.json"), root);
  const find = (rule: string, file: string, target: string) =>
    findings.find((f) => f.rule === rule && f.file === file && f.target === target)!;

  it("points at the import, the global or the call that broke the rule", () => {
    expect(
      lineOf(
        graph,
        find("module-doors", "src/app/alias-door.ts", "src/modules/billing/billing.service.ts"),
      ),
    ).toBe(1);
    expect(
      lineOf(graph, find("rules-pure-content", "src/modules/orders/impure.rules.ts", "Date.now")),
    ).toBe(6);
    expect(
      lineOf(graph, find("rules-pure-content", "src/modules/orders/impure.rules.ts", "next/cache")),
    ).toBe(4);
  });
  it("prints rule, file:line, message and target", () => {
    expect(
      located(graph, [
        find("rules-pure-content", "src/modules/orders/impure.rules.ts", "Math.random"),
      ]),
    ).toEqual([
      "rules-pure-content src/modules/orders/impure.rules.ts:7: pass randomness in (Math.random)",
    ]);
  });
});

describe("read exceptions are exact: one file, one table, read-only", () => {
  const ok = "src/modules/orders/reads-payments-ok.ts";
  const bad = "src/modules/orders/reads-payments-bad.ts";
  const variant = {
    ...arch,
    readExceptions: [ok, bad].map((file) => ({
      file,
      table: "payments",
      reason: "an orders report reads the payments table",
    })),
  };
  let rerun: Finding[] = [];
  beforeAll(async () => {
    rerun = await runAll(ctxOf(variant));
  });
  const only = (file: string) => rerun.filter((f) => f.file === file);

  it("lets the declared file read the declared table", () => {
    expect(only(ok)).toEqual([]);
  });
  it("still refuses everyone else (the same import without a declaration fails)", () => {
    expect(rulesFor(ok)).toEqual(["tables-owner-only"]);
  });
  it.each([
    ["prices", "may read only its declared table"],
    ["insert(payments)", "writes belong to the owner"],
    ["delete(prices)", "writes belong to the owner"],
    ["execute()", "raw SQL"],
    ["sql``", "raw SQL"],
  ])("rejects %s in the file that holds the exception", (target, text) => {
    expect(
      only(bad).some(
        (f) =>
          f.rule === "read-exceptions-exact" && f.target === target && f.message.includes(text),
      ),
    ).toBe(true);
  });
  it("flags a declared exception whose file does not exist", async () => {
    const stale = await runAll(
      ctxOf({
        ...arch,
        readExceptions: [
          {
            file: "src/modules/orders/gone.ts",
            table: "payments",
            reason: "a file that was deleted",
          },
        ],
      }),
    );
    expect(
      stale.some(
        (f) => f.rule === "read-exceptions-exact" && f.target === "src/modules/orders/gone.ts",
      ),
    ).toBe(true);
  });
});

describe("every rule has a fixture", () => {
  it("covers every rule id, the read-exception rule through its variant", () => {
    const covered = new Set(findings.map((f) => f.rule));
    covered.add("read-exceptions-exact");
    expect(
      buildRules(arch)
        .map((r) => r.id)
        .filter((id) => !covered.has(id)),
    ).toEqual([]);
  });
});

describe("what ArchUnitTS cannot see (the resolved graph and eslint-plugin-boundaries cover it)", () => {
  // ArchUnitTS reads only top-level `import … from`. If a future release sees these, these
  // tests fail and the limitation note in ARCHITECTURE.md can go.
  const seenBy = (rule: string, file: string) =>
    findings.some((f) => f.rule === rule && f.file === file);

  it("misses a re-export and a dynamic import between project files", () => {
    expect(seenBy("module-doors", "src/modules/orders/reexport.ts")).toBe(false);
    expect(seenBy("module-doors", "src/modules/orders/dynamic.ts")).toBe(false);
  });
  it("misses a cycle closed by a re-export", () => {
    expect(seenBy("no-cycles", "src/modules/orders/recyc-a.ts")).toBe(false);
  });
  it("flags the helper, not its caller, for an indirect import", () => {
    expect(seenBy("module-doors", "src/shared/bridge.ts")).toBe(true);
    expect(seenBy("module-doors", "src/modules/orders/via-helper.ts")).toBe(false);
  });
});
