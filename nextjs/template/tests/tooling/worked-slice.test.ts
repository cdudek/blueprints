// docs/worked-slice.md links every failure case to a test. Fail if a link goes stale.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const rows = [
  ...readFileSync(resolve(root, "docs/worked-slice.md"), "utf8").matchAll(
    /\|\s*`([^`]+)`\s*\|\s*"([^"]+)"\s*\|/g,
  ),
].map((m) => ({ file: m[1] ?? "", name: m[2] ?? "" }));

describe("worked slice links", () => {
  it("lists the failure cases", () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });
  it.each(rows)("$file: $name", ({ file, name }) => {
    expect(existsSync(resolve(root, file)), file).toBe(true);
    expect(readFileSync(resolve(root, file), "utf8")).toContain(`"${name}"`);
  });
});
