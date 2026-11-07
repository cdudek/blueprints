// The quality gates are code too: prove each one fails on a deliberate violation.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyRenames,
  compareToBaseline,
  gainedAfterRenames,
  numbered,
} from "../../scripts/quality/baseline.mjs";

const root = resolve(__dirname, "../..");
const node = (script: string, args: string[], env: Record<string, string> = {}, cwd = root) =>
  spawnSync(process.execPath, [join(root, script), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

const withoutVitest = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST")),
  ) as NodeJS.ProcessEnv;

describe("baseline arithmetic", () => {
  it("separates new findings from stale baseline lines", () => {
    expect(compareToBaseline(["a", "b"], ["b", "c"])).toEqual({ added: ["a"], stale: ["c"] });
  });
  it("sees lines a baseline gained", () => {
    expect(gainedAfterRenames(["a"], ["a", "b"], [])).toEqual(["b"]);
    expect(gainedAfterRenames(["a", "b"], ["a"], [])).toEqual([]);
  });
});

describe("baseline identity", () => {
  it("keeps multiplicity: a second identical finding is a new entry", () => {
    const base = numbered(["r|a.ts|t"]);
    const now = numbered(["r|a.ts|t", "r|a.ts|t"]);
    expect(compareToBaseline(now, base)).toEqual({ added: ["r|a.ts|t#2"], stale: [] });
  });
  it("applies a recorded rename to old entries", () => {
    expect(applyRenames(["r|old.ts|t#1"], [{ from: "old.ts", to: "new.ts" }])).toEqual([
      "r|new.ts|t#1",
    ]);
  });
  it("lets a split keep or move each line once, never copy it", () => {
    const split = [{ from: "old.ts", to: "new.ts" }];
    const before = ["r|old.ts|t#1", "r|old.ts|u#1"];
    expect(gainedAfterRenames(before, ["r|old.ts|t#1", "r|new.ts|u#1"], [], split)).toEqual([]);
    expect(gainedAfterRenames(before, ["r|old.ts|t#1", "r|new.ts|t#1"], [], split)).toEqual([
      "r|new.ts|t#1",
    ]);
    expect(gainedAfterRenames(["r|old.ts|t#1"], ["r|new.ts|t#1"], split)).toEqual([]); // a move
  });
  it("rewrites whole path fields, never a substring of another path", () => {
    const rename = [{ from: "a.ts", to: "z.ts" }];
    expect(
      applyRenames(
        [
          "r|data.ts|a.ts#2",
          "r|a.ts|src/a.tsx#1",
          "a.ts:exports:a.ts",
          "a.ts:files:a.ts",
          "a.ts:b.ts:0123456789ab#1",
          "data.ts:exports:x",
        ],
        rename,
      ),
    ).toEqual([
      "r|data.ts|z.ts#2",
      "r|z.ts|src/a.tsx#1",
      "z.ts:exports:a.ts",
      "z.ts:files:z.ts",
      "b.ts:z.ts:0123456789ab#1",
      "data.ts:exports:x",
    ]);
    expect(() => applyRenames(["x"], [{ from: "", to: "b" }])).toThrow(/non-empty/);
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

  it("writes today's findings with --write-baseline, then passes", () => {
    const file = join(mkdtempSync(join(tmpdir(), "baseline-")), "knip-baseline.json");
    expect(run(file).status).toBe(1);
    expect(
      node("scripts/quality/knip-ratchet.mjs", [
        "--cwd",
        "tests/fixtures/knip-violation",
        "--baseline",
        file,
        "--write-baseline",
      ]).status,
    ).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("util.ts:exports:unusedExport");
    expect(run(file).status).toBe(0);
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
    expect(result.stderr).toMatch(/NEW\s+copy-a\.ts:copy-b\.ts:[0-9a-f]{12}#1/);
  });

  it("admits a clone listed as a reviewed exception, and fails a stale exception", () => {
    const dir = mkdtempSync(join(tmpdir(), "dup-"));
    const copy = (n: string) =>
      spawnSync("cp", ["-R", join(root, "tests/fixtures/dup-violation", n), dir]);
    for (const n of ["copy-a.ts", "copy-b.ts", ".jscpd.json", "package.json"]) copy(n);
    mkdirSync(join(dir, "quality"));
    const first = node("scripts/quality/jscpd-ratchet.mjs", ["--cwd", dir]);
    const fingerprint = /NEW\s+(copy-a\.ts:copy-b\.ts:[0-9a-f]{12})#1/.exec(first.stderr)?.[1];
    expect(fingerprint).toBeDefined();
    const reason = "two independent implementations that change for different reasons";
    writeFileSync(
      join(dir, "quality/jscpd-exceptions.json"),
      JSON.stringify({ exceptions: [{ fingerprint, reason }] }),
    );
    expect(node("scripts/quality/jscpd-ratchet.mjs", ["--cwd", dir]).status).toBe(0);
    writeFileSync(
      join(dir, "quality/jscpd-exceptions.json"),
      JSON.stringify({ exceptions: [{ fingerprint: "x.ts:y.ts:000000000000", reason }] }),
    );
    expect(node("scripts/quality/jscpd-ratchet.mjs", ["--cwd", dir]).status).toBe(1);
  });

  it("writes today's clones with --write-baseline, then passes", () => {
    const dir = mkdtempSync(join(tmpdir(), "dup-"));
    for (const n of ["copy-a.ts", "copy-b.ts", ".jscpd.json", "package.json"])
      spawnSync("cp", [join(root, "tests/fixtures/dup-violation", n), dir]);
    mkdirSync(join(dir, "quality"));
    const run = (...a: string[]) => node("scripts/quality/jscpd-ratchet.mjs", ["--cwd", dir, ...a]);
    expect(run("--write-baseline").status).toBe(0);
    expect(readFileSync(join(dir, "quality/jscpd-baseline.json"), "utf8")).toMatch(
      /copy-a\.ts:copy-b\.ts:[0-9a-f]{12}#1/,
    );
    expect(run().status).toBe(0);
  });

  it("is green on the template itself", () => {
    expect(node("scripts/quality/jscpd-ratchet.mjs", []).status).toBe(0);
  });
});

describe("arch:baseline:write", () => {
  it("freezes today's findings but never a leak into the browser, and fails while one remains", () => {
    const dir = mkdtempSync(join(tmpdir(), "arch-write-"));
    cpSync(join(root, "tests/fixtures/arch-violations"), dir, { recursive: true });
    mkdirSync(join(dir, "quality"));
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        join(root, "scripts/quality/arch-baseline-write.mjs"),
        "--tsconfig",
        "tsconfig.json",
      ],
      // ArchUnitTS switches to its vitest integration when it sees VITEST in the environment
      { cwd: dir, encoding: "utf8", env: withoutVitest() },
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("NEVER BASELINED client-runtime-closure");
    const written = JSON.parse(readFileSync(join(dir, "quality/arch-baseline.json"), "utf8"))
      .entries as string[];
    expect(written).toContain(
      "module-doors|src/app/alias-door.ts|src/modules/billing/billing.service.ts#1",
    );
    const never = [
      "client-runtime-closure",
      "public-door-closure",
      "server-only-in-server-files",
      "ui-no-server",
    ];
    expect(written.filter((k) => never.includes(k.split("|")[0] ?? ""))).toEqual([]);
    expect(written.filter((k) => k.startsWith("access-declared|"))).toEqual([]);
  }, 120_000);
});

describe("baseline-shrinks", () => {
  function repoWithBaseline(entries: string[], extra: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), "shrink-"));
    const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    mkdirSync(join(dir, "quality"));
    for (const f of ["arch", "knip", "jscpd"])
      writeFileSync(
        join(dir, `quality/${f}-baseline.json`),
        JSON.stringify({ entries: f === "arch" ? entries : [] }),
      );
    for (const [f, text] of Object.entries(extra)) writeFileSync(join(dir, f), text);
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "feature");
    return {
      dir,
      git,
      set: (e: string[]) =>
        writeFileSync(join(dir, "quality/arch-baseline.json"), JSON.stringify({ entries: e })),
      renames: (r: { from: string; to: string }[]) =>
        writeFileSync(join(dir, "quality/baseline-renames.json"), JSON.stringify({ renames: r })),
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

  it("treats a recorded, verified rename as a move, not an addition", () => {
    const { dir, git, set, renames } = repoWithBaseline(["r|old.ts|t#1"], { "old.ts": "x\n" });
    git("mv", "old.ts", "new.ts");
    set(["r|new.ts|t#1"]);
    expect(check(dir).status).toBe(1); // an unexplained rename is an addition
    renames([{ from: "old.ts", to: "new.ts" }]);
    expect(check(dir).status).toBe(0);
  });

  it("counts a split that keeps the source as a move of the lines that left", () => {
    const { dir, set, renames } = repoWithBaseline(["r|old.ts|t#1", "r|old.ts|u#1"], {
      "old.ts": "x\n",
    });
    writeFileSync(join(dir, "new.ts"), "y\n");
    set(["r|old.ts|t#1", "r|new.ts|u#1"]);
    renames([{ from: "old.ts", to: "new.ts" }]);
    expect(check(dir).status).toBe(0);
  });

  it("ignores a rename whose source never existed or whose destination already did", () => {
    const { dir, set, renames } = repoWithBaseline(["r|a.ts|t#1"], { "a.ts": "", "b.ts": "" });
    set(["r|a.ts|t#1", "r|b.ts|t#1"]);
    renames([{ from: "a.ts", to: "b.ts" }]);
    const result = check(dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("the destination existed at the merge base");
  });

  it("adopts a baseline that did not exist at the merge base", () => {
    const { dir } = repoWithBaseline([]);
    writeFileSync(
      join(dir, "quality/jscpd-exceptions.json"),
      JSON.stringify({ exceptions: [{ fingerprint: "a.ts:b.ts:0123456789ab", reason: "r" }] }),
    );
    const result = check(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("jscpd-exceptions.json adopted with 1 entries");
  });

  it("ratchets the reviewed jscpd exceptions once they exist", () => {
    const exceptions = (f: string[]) =>
      JSON.stringify({ exceptions: f.map((fingerprint) => ({ fingerprint, reason: "r" })) });
    const { dir } = repoWithBaseline([], { "quality/jscpd-exceptions.json": exceptions(["a"]) });
    writeFileSync(join(dir, "quality/jscpd-exceptions.json"), exceptions(["a", "b"]));
    expect(check(dir).stderr).toContain("jscpd-exceptions.json gained b");
  });

  it("fails closed on a baseline that does not parse", () => {
    const { dir } = repoWithBaseline([]);
    writeFileSync(join(dir, "quality/arch-baseline.json"), "{ not json");
    expect(check(dir).status).toBe(2);
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
