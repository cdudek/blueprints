// The ESLint side: eslint.config.mjs imports a config generated from architecture.json.
// Tests: it is not stale, and it rejects the same deliberate violations, including the ones
// ArchUnitTS cannot see (re-export, dynamic import).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { buildBoundariesConfig } from "../../scripts/arch/eslint-boundaries.mjs";
import { loadArchitecture } from "../../scripts/arch/lib.mjs";

const projectRoot = resolve(__dirname, "../..");
const fixtureRoot = resolve(projectRoot, "tests/fixtures/arch-violations");

const optionsOf = (rule: unknown) => (Array.isArray(rule) ? rule.slice(1) : []);

describe("eslint config is generated from architecture.json", () => {
  const generated = buildBoundariesConfig(loadArchitecture(projectRoot));
  const effective = async (file: string) => {
    const eslint = new ESLint({ cwd: projectRoot });
    return (await eslint.calculateConfigForFile(file)) as {
      settings: Record<string, unknown>;
      rules: Record<string, [unknown, ...unknown[]]>;
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

  it("carries the rules-purity bans for *.rules.ts", async () => {
    const config = await effective("src/modules/orders/order.rules.ts");
    const [, purity] = generated;
    expect(optionsOf(config.rules["no-restricted-syntax"])).toEqual(
      optionsOf(purity?.rules?.["no-restricted-syntax"]),
    );
  });

  it("holds no second hand-kept list: the config file only imports the generator", () => {
    const source = readFileSync(resolve(projectRoot, "eslint.config.mjs"), "utf8");
    expect(source).toContain("buildBoundariesConfig(loadArchitecture())");
    expect(source).not.toContain("boundaries/elements");
    expect(source).not.toContain("boundaries/dependencies");
  });
});

describe("eslint rejects the deliberate violations", () => {
  const arch = loadArchitecture(fixtureRoot);
  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    ignore: false,
    overrideConfig: [
      { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
      ...buildBoundariesConfig(arch, {
        tsconfig: resolve(fixtureRoot, "tsconfig.json"),
        rootPath: fixtureRoot,
      }),
    ],
  });
  const lint = async (file: string) =>
    (await eslint.lintFiles([file]))[0]?.messages.map((m) => `${m.ruleId}: ${m.message}`) ?? [];

  const mustFail: [string, string][] = [
    ["src/app/alias-door.ts", "alias import of a module internal"],
    ["src/modules/orders/relative-door.ts", "relative import of a module internal"],
    ["src/modules/orders/reexport.ts", "re-export of a module internal"],
    ["src/modules/orders/dynamic.ts", "dynamic import of a module internal"],
    ["src/shared/bridge.ts", "indirect import, caught at the helper"],
    ["src/modules/billing/uses-orders.ts", "undeclared module edge"],
    ["src/modules/orders/bad-imports.rules.ts", "rules importing persistence and app"],
    ["src/modules/orders/impure.rules.ts", "impure rules"],
    ["src/ui/BadButton.tsx", "ui importing a module"],
    ["src/ui/ServerThing.tsx", "ui importing server code"],
    ["src/shared/leak.ts", "shared importing a module"],
    ["src/modules/orders/imports-app.ts", "a module importing app"],
    ["src/modules/orders/components/BadList.tsx", "a component importing persistence"],
    ["src/app/reads-orders-table.ts", "app importing a table file"],
    ["src/modules/billing/reads-orders-table.ts", "a non-owner importing a table file"],
    ["src/modules/billing/direct-provider.ts", "importing a provider directly"],
    ["src/app/bad-actions.ts", "app importing persistence"],
  ];
  it.each(mustFail)("%s (%s)", async (file) => {
    expect((await lint(file)).length).toBeGreaterThan(0);
  });

  it("flags impure syntax in rules files", async () => {
    const messages = (await lint("src/modules/orders/impure.rules.ts")).join("\n");
    for (const needle of ["no-restricted-syntax", "no-restricted-imports"])
      expect(messages).toContain(needle);
  });

  it.each([
    "src/modules/orders/order.service.ts",
    "src/modules/billing/billing.service.ts",
    "src/app/page.tsx",
    "src/ui/Button.tsx",
  ])("stays quiet on the clean file %s", async (file) => {
    expect(await lint(file)).toEqual([]);
  });
});
