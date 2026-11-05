// The quality gates are code too: prove each one fails on a deliberate violation.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareToBaseline, gainedEntries } from "../../scripts/quality/baseline.mjs";

const root = resolve(__dirname, "../..");
const node = (script: string, args: string[], env: Record<string, string> = {}, cwd = root) =>
  spawnSync(process.execPath, [join(root, script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

describe("baseline arithmetic", () => {
  it("separates new findings from stale baseline lines", () => {
    expect(compareToBaseline(["a", "b"], ["b", "c"])).toEqual({ added: ["a"], stale: ["c"] });
  });
  it("sees lines a baseline gained", () => {
    expect(gainedEntries(["a"], ["a", "b"])).toEqual(["b"]);
    expect(gainedEntries(["a", "b"], ["a"])).toEqual([]);
  });
});

describe("knip ratchet", () => {
  const run = (baseline?: string) =>
    node("scripts/quality/knip-ratchet.mjs", [
      "--cwd",
      "tests/fixtures/knip-violation",
      ...(baseline ? ["--baseline", baseline] : []),
    ]);

  it("rejects an unused file and an unused export, keyed file:type:name", () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unused-file.ts:files:unused-file.ts");
    expect(result.stderr).toContain("util.ts:exports:unusedExport");
  });

  it("passes once the findings are baselined, and fails on a stale baseline line", () => {
    const dir = mkdtempSync(join(tmpdir(), "baseline-"));
    const file = join(dir, "knip-baseline.json");
    const entries = ["unused-file.ts:files:unused-file.ts", "util.ts:exports:unusedExport"];
    writeFileSync(file, JSON.stringify({ entries }));
    expect(run(file).status).toBe(0);
    writeFileSync(file, JSON.stringify({ entries: [...entries, "gone.ts:files:gone.ts"] }));
    const stale = run(file);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("STALE gone.ts:files:gone.ts");
  });

  it("is green on the template itself", () => {
    expect(node("scripts/quality/knip-ratchet.mjs", []).status).toBe(0);
  });
});

describe("jscpd ratchet", () => {
  it("rejects a duplicated block, keyed by both files and a content hash", () => {
    const result = node("scripts/quality/jscpd-ratchet.mjs", [
      "--cwd",
      "tests/fixtures/dup-violation",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/NEW\s+copy-a\.ts:copy-b\.ts:[0-9a-f]{12}/);
  });

  it("is green on the template itself", () => {
    expect(node("scripts/quality/jscpd-ratchet.mjs", []).status).toBe(0);
  });
});

describe("baseline-shrinks", () => {
  function repoWithBaseline(entries: string[]) {
    const dir = mkdtempSync(join(tmpdir(), "shrink-"));
    const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    mkdirSync(join(dir, "quality"));
    for (const f of ["arch", "knip", "jscpd"])
      writeFileSync(join(dir, `quality/${f}-baseline.json`), JSON.stringify({ entries }));
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "feature");
    return {
      dir,
      set: (e: string[]) =>
        writeFileSync(join(dir, "quality/arch-baseline.json"), JSON.stringify({ entries: e })),
    };
  }
  const check = (dir: string) =>
    node("scripts/quality/baseline-shrinks.mjs", [], { BASELINE_BASE_REF: "main" }, dir);

  it("fails when a branch adds a baseline line", () => {
    const { dir, set } = repoWithBaseline(["old"]);
    set(["old", "new"]);
    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("gained new");
  });

  it("passes when a branch only deletes lines", () => {
    const { dir, set } = repoWithBaseline(["old", "older"]);
    set(["old"]);
    expect(check(dir).status).toBe(0);
  });

  it("fails closed in CI when it cannot find the base", () => {
    const { dir } = repoWithBaseline([]);
    const result = node(
      "scripts/quality/baseline-shrinks.mjs",
      [],
      { BASELINE_BASE_REF: "nope", CI: "true" },
      dir,
    );
    expect(result.status).toBe(2);
  });
});
