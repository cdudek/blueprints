// The ESLint side: eslint.config.mjs imports a config generated from architecture.json (and from
// the shared baseline). Tests: it is not stale, it checks dependencies inside a module and
// unknown files, and it rejects the deliberate violations with the SPECIFIC diagnostic, including
// the re-export and dynamic import forms ArchUnitTS cannot see.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import {
  baselinedDependencies,
  buildBoundariesConfig,
} from "../../scripts/arch/eslint-boundaries.mjs";
import { loadArchitecture } from "../../scripts/arch/lib.mjs";
import { readBaseline } from "../../scripts/quality/baseline.mjs";

const projectRoot = resolve(__dirname, "../..");
const fixtureRoot = resolve(projectRoot, "tests/fixtures/arch-violations");
const optionsOf = (rule: unknown) => (Array.isArray(rule) ? rule.slice(1) : []);

describe("eslint config is generated from architecture.json", () => {
  const baseline = readBaseline(resolve(projectRoot, "quality/arch-baseline.json"));
  const generated = buildBoundariesConfig(loadArchitecture(projectRoot), { baseline });
  const effective = async (file: string) => {
    const eslint = new ESLint({ cwd: projectRoot });
    return (await eslint.calculateConfigForFile(file)) as {
      settings: Record<string, unknown>;
      rules: Record<string, unknown>;
    };
  };

  it("is not stale: the effective config equals a fresh generation", async () => {
    const config = await effective("src/modules/orders/order.service.ts");
    const [boundaries] = generated;
    expect(config.settings["boundaries/elements"]).toEqual(
      boundaries?.settings?.["boundaries/elements"],
    );
    expect(config.settings["boundaries/files"]).toEqual(boundaries?.settings?.["boundaries/files"]);
    expect(optionsOf(config.rules["boundaries/dependencies"])).toEqual(
      optionsOf(boundaries?.rules?.["boundaries/dependencies"]),
    );
  });

  it("checks dependencies inside a module and rejects unknown files", async () => {
    const config = await effective("src/modules/orders/order.service.ts");
    const [options] = optionsOf(config.rules["boundaries/dependencies"]) as [
      { checkInternals: boolean },
    ];
    expect(options.checkInternals).toBe(true);
    expect(config.rules["boundaries/no-unknown-files"]).toBeDefined();
  });

  it("carries the rules-purity bans for *.rules.ts", async () => {
    const config = await effective("src/modules/orders/order.rules.ts");
    const purity = generated.find((c) => c.name === "architecture/rules-purity");
    expect(optionsOf(config.rules["no-restricted-syntax"])).toEqual(
      optionsOf(purity?.rules?.["no-restricted-syntax"]),
    );
    expect(config.rules["no-restricted-globals"]).toBeDefined();
  });

  it("holds no second hand-kept list: the config file only imports the generator", () => {
    const source = readFileSync(resolve(projectRoot, "eslint.config.mjs"), "utf8");
    expect(source).toContain("buildBoundariesConfig(loadArchitecture()");
    expect(source).not.toContain("boundaries/elements");
    expect(source).not.toContain("boundaries/dependencies");
  });

  it("turns the shared baseline into exact file-to-file allow policies", () => {
    expect(
      baselinedDependencies([
        "module-doors|src/a.ts|src/modules/x/x.service.ts#1",
        "no-cycles-complete|src/a.ts|a -> b#1",
        "table-definitions-declared|architecture.json|ghosts#1",
      ]),
    ).toEqual([{ file: "src/a.ts", target: "src/modules/x/x.service.ts" }]);
  });
});

describe("eslint rejects the deliberate violations with the intended diagnostic", () => {
  const arch = loadArchitecture(fixtureRoot);
  const lintWith = async (baseline: string[] = []) => {
    const eslint = new ESLint({
      cwd: fixtureRoot,
      overrideConfigFile: true,
      ignore: false,
      overrideConfig: [
        { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
        ...buildBoundariesConfig(arch, {
          tsconfig: resolve(fixtureRoot, "tsconfig.json"),
          rootPath: fixtureRoot,
          baseline,
        }),
      ],
    });
    return async (file: string) => (await eslint.lintFiles([file]))[0]?.messages ?? [];
  };

  const doors = /Enter a module only through its doors/;
  // [file, rule id, message pattern, why]
  const mustFail: [string, string, RegExp, string][] = [
    [
      "src/app/alias-door.ts",
      "boundaries/dependencies",
      doors,
      "alias import of a module internal",
    ],
    [
      "src/modules/orders/relative-door.ts",
      "boundaries/dependencies",
      doors,
      "relative import of a module internal",
    ],
    [
      "src/modules/orders/reexport.ts",
      "boundaries/dependencies",
      doors,
      "re-export of a module internal",
    ],
    [
      "src/modules/orders/dynamic.ts",
      "boundaries/dependencies",
      doors,
      "dynamic import of a module internal",
    ],
    [
      "src/shared/bridge.ts",
      "boundaries/dependencies",
      /src\/shared never imports/,
      "indirect import, caught at the helper",
    ],
    [
      "src/modules/billing/uses-orders.ts",
      "boundaries/dependencies",
      /may not depend on this module/,
      "undeclared module edge",
    ],
    [
      "src/modules/billing/dyn-edge.ts",
      "boundaries/dependencies",
      /may not depend on this module/,
      "undeclared edge by dynamic import",
    ],
    [
      "src/modules/orders/bad-imports.rules.ts",
      "boundaries/dependencies",
      /Rules are pure/,
      "rules importing persistence and app",
    ],
    [
      "src/modules/orders/dyn-repo.rules.ts",
      "boundaries/dependencies",
      /Rules are pure/,
      "rules dynamically importing their OWN repository (same module)",
    ],
    [
      "src/modules/orders/impure.rules.ts",
      "no-restricted-imports",
      /Rules are pure/,
      "impure imports",
    ],
    [
      "src/modules/orders/impure.rules.ts",
      "no-restricted-globals",
      /Rules are pure/,
      "ambient globals",
    ],
    [
      "src/modules/orders/impure.rules.ts",
      "no-restricted-syntax",
      /Rules are pure/,
      "Date.now, Math.random",
    ],
    ["src/ui/BadButton.tsx", "boundaries/dependencies", /design system/, "ui importing a module"],
    ["src/ui/ServerThing.tsx", "boundaries/dependencies", /src\/ui/, "ui importing server code"],
    [
      "src/shared/leak.ts",
      "boundaries/dependencies",
      /src\/shared never imports/,
      "shared importing a module",
    ],
    [
      "src/shared/calls-client.ts",
      "boundaries/dependencies",
      /src\/shared never imports a client/,
      "shared importing a client",
    ],
    [
      "src/shared/session-io.ts",
      "no-restricted-imports",
      /src\/shared does no I\/O/,
      "shared reading the request",
    ],
    [
      "src/modules/orders/imports-app.ts",
      "boundaries/dependencies",
      /Nothing imports src\/app/,
      "a module importing app",
    ],
    [
      "src/modules/orders/components/BadList.tsx",
      "boundaries/dependencies",
      /Components get data/,
      "a component importing its OWN repository",
    ],
    [
      "src/app/reads-orders-table.ts",
      "boundaries/dependencies",
      /app\/ goes through/,
      "app importing a table file",
    ],
    [
      "src/modules/billing/reads-orders-table.ts",
      "boundaries/dependencies",
      /may not depend on this module/,
      "a non-owner importing a table file",
    ],
    [
      "src/modules/billing/direct-provider.ts",
      "boundaries/dependencies",
      /Providers are imported only/,
      "importing a provider directly",
    ],
    [
      "src/app/bad-actions.ts",
      "boundaries/dependencies",
      /app\/ goes through/,
      "app importing persistence",
    ],
    [
      "src/instrumentation.ts",
      "boundaries/dependencies",
      /import no module/,
      "instrumentation.ts importing a module",
    ],
    [
      "src/escape.ts",
      "boundaries/no-unknown-files",
      /does not match any file pattern/,
      "a loose file re-exporting a repository",
    ],
  ];

  it.each(mustFail)("%s -> %s (%s)", async (file, ruleId, pattern) => {
    const lint = await lintWith();
    const messages = await lint(file);
    expect(
      messages.some((m) => m.ruleId === ruleId && pattern.test(m.message)),
      JSON.stringify(messages.map((m) => `${m.ruleId}: ${m.message}`)),
    ).toBe(true);
  });

  it("fails for the intended rule family only", async () => {
    const lint = await lintWith();
    for (const [file, ruleId] of mustFail) {
      const family = ruleId.startsWith("boundaries/") ? "boundaries/" : ruleId;
      const others = (await lint(file)).filter(
        (m) => m.ruleId && !m.ruleId.startsWith(family) && !m.ruleId.startsWith("no-restricted"),
      );
      expect(
        others.map((m) => m.ruleId),
        file,
      ).toEqual([]);
    }
  });

  it.each([
    "src/modules/orders/order.service.ts",
    "src/modules/orders/order.rules.ts",
    "src/modules/billing/billing.service.ts",
    "src/modules/orders/components/GoodClient.tsx",
    "src/app/page.tsx",
    "src/app/api/hook/route.ts",
    "src/db/schema.ts",
    "src/proxy.ts",
    "src/ui/Button.tsx",
    "src/app/place/PlaceButton.tsx",
    "src/shared/auth.ts",
    "src/worker.ts",
  ])("stays quiet on the clean file %s", async (file) => {
    const lint = await lintWith();
    expect(await lint(file)).toEqual([]);
  });

  it("admits baselined historical debt, and only the exact pair", async () => {
    const lint = await lintWith([
      "module-doors|src/app/alias-door.ts|src/modules/billing/billing.service.ts#1",
    ]);
    expect(await lint("src/app/alias-door.ts")).toEqual([]);
    expect((await lint("src/modules/orders/relative-door.ts")).length).toBeGreaterThan(0);
  });
});
