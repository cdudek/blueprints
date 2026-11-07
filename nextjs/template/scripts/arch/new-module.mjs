// Scaffolds a module that already satisfies every architecture rule:
//   pnpm new:module <plural-name> [--singular <name>]
// Creates the doors, service, repository, pure rules with a test, schema, types, tables and a
// component; declares the module and its table in architecture.json; composes the table into
// src/db/schema.ts; regenerates the diagram. Then run `pnpm db:generate` for the migration.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { embed, renderDiagram } from "./diagram.mjs";
import { layoutOf, loadArchitecture } from "./lib.mjs";

const root = process.cwd();
const [name, ...rest] = process.argv.slice(2);
const singularFlag = rest.indexOf("--singular");
const singular = singularFlag >= 0 ? rest[singularFlag + 1] : name?.replace(/s$/, "");

if (!name || !/^[a-z][a-z0-9-]*$/.test(name) || !singular) {
  console.error(
    "usage: pnpm new:module <plural-name> [--singular <name>]   (lowercase, e.g. invoices)",
  );
  process.exit(2);
}
const pascal = (s) =>
  s
    .split("-")
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
const camel = (s) => pascal(s)[0].toLowerCase() + pascal(s).slice(1);
const snake = (s) => s.replace(/-/g, "_");
const P = pascal(singular);
const Ps = pascal(name);
const s = singular;
const arch = loadArchitecture(root);
const L = layoutOf(arch);
const dir = join(root, arch.srcRoot, L.modules, name);
/** the import specifier of a file under srcRoot: "db/index.ts" -> "@/db" */
const spec = (p) => `@/${p.replace(/(\/index)?\.tsx?$/, "")}`;
if (existsSync(dir) || arch.modules[name] || arch.tables[snake(name)]) {
  console.error(`module ${name} (or its table) already exists`);
  process.exit(1);
}

const files = {
  [`${s}.tables.ts`]: `import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const ${camel(name)} = pgTable("${snake(name)}", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
`,
  [`${s}.types.ts`]: `import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { ${camel(name)} } from "./${s}.tables";

export type ${P} = InferSelectModel<typeof ${camel(name)}>;
export type New${P} = InferInsertModel<typeof ${camel(name)}>;
export type ${P}Row = Pick<${P}, "id" | "name" | "createdAt">;
`,
  [`${s}.schema.ts`]: `import { z } from "zod";

export const create${P}Schema = z.object({ name: z.string().trim().min(1).max(120) });
export type Create${P}Input = z.infer<typeof create${P}Schema>;
`,
  [`${s}.rules.ts`]: `// Pure rules: data in, data out. No database, network, clock or randomness.
export function isValid${P}Name(name: string): boolean {
  return name.trim().length > 0 && name.length <= 120;
}
`,
  [`${s}.rules.test.ts`]: `import { describe, expect, it } from "vitest";
import { isValid${P}Name } from "./${s}.rules";

describe("isValid${P}Name", () => {
  it("accepts a normal name and rejects blank or oversized ones", () => {
    expect(isValid${P}Name("first")).toBe(true);
    expect(isValid${P}Name("   ")).toBe(false);
    expect(isValid${P}Name("x".repeat(121))).toBe(false);
  });
});
`,
  [`${s}.repository.ts`]: `import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, type DbClient } from "${spec(L.dbClient)}";
import { ${camel(name)} } from "./${s}.tables";
import type { ${P} } from "./${s}.types";

// Every method takes an optional transaction client; the calling service owns the boundary.
export const ${camel(s)}Repository = {
  listForUser(userId: string, c: DbClient = db): Promise<${P}[]> {
    return c.select().from(${camel(name)}).where(eq(${camel(name)}.userId, userId)).orderBy(desc(${camel(name)}.createdAt));
  },
};
`,
  [`${s}.service.ts`]: `import "server-only";
import { operation } from "${spec(`${L.shared}/access.ts`)}";
import { ok } from "${spec(L.resultFile)}";
import { ${camel(s)}Repository as repo } from "./${s}.repository";

// Every operation declares its access policy (user, public, webhook or job).
export const listMy${Ps} = operation(
  { access: "user", resource: "the caller's own ${name}" },
  async (user) => ok(await repo.listForUser(user.id)),
);
`,
  "server.ts": `import "server-only";

export { listMy${Ps} } from "./${s}.service";
`,
  "public.ts": `// Browser-safe: types, zod schemas and components. List exports by name, never export *.
export { ${P}List } from "./components/${P}List";
export { create${P}Schema, type Create${P}Input } from "./${s}.schema";
export type { ${P}, ${P}Row } from "./${s}.types";
`,
  [`components/${P}List.tsx`]: `import { Text } from "${spec(L.ui)}";
import type { ${P}Row } from "../${s}.types";

// Business component: knows the ${s} type, is built from src/ui, gets its data through props.
export function ${P}List({ rows }: { rows: ${P}Row[] }) {
  if (rows.length === 0) return <p>No ${name} yet.</p>;
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          <Text>{row.name}</Text>
        </li>
      ))}
    </ul>
  );
}
`,
};
for (const [file, text] of Object.entries(files)) {
  const target = join(dir, file);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, text);
}

// the policy file: the module and the table it owns
arch.modules[name] = { description: `${Ps} (describe this module)` };
arch.tables[snake(name)] = name;
writeFileSync(join(root, "architecture.json"), `${JSON.stringify(arch, null, 2)}\n`);

// the persistence composition root
const schemaFile = join(root, arch.srcRoot, L.schemaRoot);
let schema = readFileSync(schemaFile, "utf8");
schema = schema.replace(
  /(import \* as [^\n]+\n)(?!import)/,
  `$1import * as ${camel(name)} from "@/${L.modules}/${name}/${s}.tables";\n`,
);
schema = schema.replace(
  /export const schema = \{([^}]*)\};/,
  (_m, inner) => `export const schema = {${inner.trim()}, ...${camel(name)} };`,
);
writeFileSync(schemaFile, schema);

// the generated diagram
const docFile = join(root, "docs/architecture.md");
writeFileSync(docFile, embed(readFileSync(docFile, "utf8"), renderDiagram(arch)));

console.log(
  `created ${arch.srcRoot}/${L.modules}/${name}. Next: pnpm db:generate, describe the module in architecture.json, declare any edge it needs, pnpm check`,
);
