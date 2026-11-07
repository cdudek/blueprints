import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv";
import { beforeAll, describe, expect, it } from "vitest";
import { buildBoundariesConfig } from "../../scripts/arch/eslint-boundaries.mjs";
import { BLUEPRINT_VERSION, layoutOf, loadArchitecture } from "../../scripts/arch/lib.mjs";
import { compareToBaseline, readBaseline } from "../../scripts/quality/baseline.mjs";
import { buildGraph } from "./graph.ts";
import { located } from "./reporting.ts";
import { buildRules, findingKeys, runAll, type Finding } from "./rules.ts";

const root = resolve(__dirname, "../..");
const arch = loadArchitecture(root);
const baselineFile = resolve(root, "quality/arch-baseline.json");
const rules = buildRules(arch);
let findings: Finding[] = [];

beforeAll(async () => {
  findings = await runAll({ arch, tsconfig: resolve(root, "tsconfig.arch.json"), root });
});

describe("policy file", () => {
  it("matches its JSON Schema, and the schema, scripts and file agree on the version", () => {
    const schema = JSON.parse(readFileSync(resolve(root, "architecture.schema.json"), "utf8"));
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    expect(validate(arch), JSON.stringify(validate.errors)).toBe(true);
    expect(schema["x-schemaVersion"]).toBe(BLUEPRINT_VERSION);
    expect(arch.$schemaVersion).toBe(BLUEPRINT_VERSION);
    expect(readFileSync(resolve(root, "CHANGELOG.md"), "utf8")).toContain(
      `## ${BLUEPRINT_VERSION}`,
    );
  });

  // cycles between declared edges are the rule declared-edges-acyclic, so they can be baselined
  it("declares edges between declared modules, and owners that exist", () => {
    for (const e of arch.edges) {
      expect(Object.keys(arch.modules), `${e.from} -> ${e.to}`).toContain(e.from);
      expect(Object.keys(arch.modules), `${e.from} -> ${e.to}`).toContain(e.to);
    }
    for (const owner of Object.values(arch.tables))
      expect(Object.keys(arch.modules)).toContain(owner);
  });

  it("lets a read exception exist only for a declared edge, a declared table and a real file", () => {
    for (const x of arch.readExceptions) {
      const owner = arch.tables[x.table];
      const reader = /modules\/([^/]+)\//.exec(x.file)?.[1];
      expect(owner, `table ${x.table}`).toBeDefined();
      expect(
        arch.edges.some((e) => e.from === reader && e.to === owner),
        `${reader} -> ${owner}`,
      ).toBe(true);
    }
  });

  it("never exempts a never-baselinable rule", () => {
    const protectedRules = new Set(rules.filter((r) => r.neverBaseline).map((r) => r.id));
    for (const e of arch.exemptions)
      for (const id of e.rules) expect(protectedRules.has(id), id).toBe(false);
  });
});

describe("a 1.0.0 policy file under these scripts", () => {
  const oldRoot = resolve(root, "tests/fixtures/policy-1.0.0");
  const old = loadArchitecture(oldRoot);

  it("loads, matches the schema and gets the 1.0.0 paths: every new key is optional", () => {
    const schema = JSON.parse(readFileSync(resolve(root, "architecture.schema.json"), "utf8"));
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    expect(old.$schemaVersion).toBe("1.0.0");
    expect(validate(old), JSON.stringify(validate.errors)).toBe(true);
    expect(layoutOf(old)).toMatchObject({
      app: "app",
      modules: "modules",
      db: "db",
      dbClient: "db/index.ts",
      schemaRoot: "db/schema.ts",
    });
  });

  it("builds every rule and the eslint config", () => {
    expect(buildRules(old).length).toBe(rules.length);
    expect(buildBoundariesConfig(old).length).toBeGreaterThan(0);
  });
});

describe("rules on the real tree", () => {
  const baseline = readBaseline(baselineFile);
  const keys = (rule: string) => findingKeys(findings.filter((f) => f.rule === rule));

  // Positive control at scale: the template is greenfield, so every rule finds nothing.
  for (const rule of rules.filter((r) => r.severity !== "diagnostic")) {
    it(rule.description, () => {
      const fresh = keys(rule.id).filter((k) => !baseline.includes(k));
      const where = fresh.length
        ? located(
            buildGraph(resolve(root, "tsconfig.arch.json"), root),
            findings.filter((f) => f.rule === rule.id),
          ).join("\n")
        : "";
      expect(fresh, where).toEqual([]);
    });
  }

  it("reports diagnostics without failing on them", () => {
    const diagnostics = rules.filter((r) => r.severity === "diagnostic").flatMap((r) => keys(r.id));
    if (diagnostics.length)
      console.warn(`architecture diagnostics (not failing):\n${diagnostics.join("\n")}`);
    expect(diagnostics).toEqual([]); // the template itself keeps them at zero
  });
});

describe("baseline", () => {
  const baseline = readBaseline(baselineFile);
  const never = new Set(rules.filter((r) => r.neverBaseline).map((r) => r.id));
  const known = new Set(rules.map((r) => r.id));

  it("is empty in a greenfield template, and holds only known, baselinable rules otherwise", () => {
    for (const k of baseline) {
      const id = k.split("|")[0] ?? "";
      expect(known.has(id), `unknown rule in baseline: ${id}`).toBe(true);
      expect(
        never.has(id),
        `${id} can never be baselined: server code or secrets in a browser bundle`,
      ).toBe(false);
    }
  });

  it("holds no stale entry: a fixed violation deletes its line", () => {
    const { stale } = compareToBaseline(findingKeys(findings), baseline);
    expect(stale).toEqual([]);
  });
});
