import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv";
import { beforeAll, describe, expect, it } from "vitest";
import { findEdgeCycle, loadArchitecture } from "../../scripts/arch/lib.mjs";
import { compareToBaseline, readBaseline } from "../../scripts/quality/baseline.mjs";
import { buildRules, findingKey, runAll, type Finding } from "./rules";

const root = resolve(__dirname, "../..");
const arch = loadArchitecture(root);
const baselineFile = resolve(root, "quality/arch-baseline.json");
const rules = buildRules(arch);
let findings: Finding[] = [];

beforeAll(async () => {
  findings = await runAll({ arch, tsconfig: resolve(root, "tsconfig.arch.json"), root });
});

describe("policy file", () => {
  it("matches its JSON Schema", () => {
    const schema = JSON.parse(readFileSync(resolve(root, "architecture.schema.json"), "utf8"));
    const validate = new Ajv({ allErrors: true }).compile(schema);
    expect(validate(arch), JSON.stringify(validate.errors)).toBe(true);
  });

  it("declares acyclic edges between declared modules, and owners that exist", () => {
    for (const e of arch.edges) {
      expect(Object.keys(arch.modules), `${e.from} -> ${e.to}`).toContain(e.from);
      expect(Object.keys(arch.modules), `${e.from} -> ${e.to}`).toContain(e.to);
    }
    expect(findEdgeCycle(arch)).toBeNull();
    for (const owner of Object.values(arch.tables))
      expect(Object.keys(arch.modules)).toContain(owner);
  });

  it("lets a read exception exist only next to a declared edge, for a declared table", () => {
    for (const x of arch.readExceptions) {
      const owner = arch.tables[x.table];
      expect(owner, `table ${x.table}`).toBeDefined();
      expect(
        arch.edges.some((e) => e.from === x.reader && e.to === owner),
        `${x.reader} -> ${owner}`,
      ).toBe(true);
    }
  });

  it("never exempts a non-negotiable rule", () => {
    const protectedRules = new Set(rules.filter((r) => r.nonNegotiable).map((r) => r.id));
    for (const e of arch.exemptions)
      for (const id of e.rules) expect(protectedRules.has(id), id).toBe(false);
  });
});

describe("rules on the real tree", () => {
  const baseline = readBaseline(baselineFile);
  for (const rule of rules) {
    it(rule.description, () => {
      const mine = findings.filter((f) => f.rule === rule.id);
      const fresh = rule.nonNegotiable
        ? mine
        : mine.filter((f) => !baseline.includes(findingKey(f)));
      expect(fresh.map((f) => `${findingKey(f)}  ${f.message}`)).toEqual([]);
    });
  }
});

describe("baseline", () => {
  const baseline = readBaseline(baselineFile);
  const neverBaselined = new Set(rules.filter((r) => r.nonNegotiable).map((r) => r.id));

  it("holds no entry for a non-negotiable rule", () => {
    expect(baseline.filter((k) => neverBaselined.has(k.split("|")[0] ?? ""))).toEqual([]);
  });

  it("holds no stale entry: a fixed violation deletes its line", () => {
    const { stale } = compareToBaseline(findings.map(findingKey), baseline);
    expect(stale).toEqual([]);
  });
});
