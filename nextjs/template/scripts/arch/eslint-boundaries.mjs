// Builds the eslint-plugin-boundaries config (plus the rules-purity syntax bans) from
// architecture.json. eslint.config.mjs imports this, so there is no second hand-kept list.
import boundaries from "eslint-plugin-boundaries";
import { allowedTargets, moduleNames, tableOwnersReadBy } from "./lib.mjs";

/**
 * @param {import("./lib.mjs").Architecture} arch
 * @param {{ tsconfig?: string, rootPath?: string }} [options]
 * @returns {import("eslint").Linter.Config[]}
 */
export function buildBoundariesConfig(arch, options = {}) {
  const src = arch.srcRoot;
  const tsconfig = options.tsconfig ?? "./tsconfig.json";
  const owners = moduleNames(arch);

  const elements = [
    { type: "app", pattern: `${src}/app`, partialMatch: false },
    { type: "ui", pattern: `${src}/ui`, partialMatch: false },
    { type: "shared", pattern: `${src}/shared`, partialMatch: false },
    { type: "client", pattern: `${src}/clients/*`, capture: ["client"], partialMatch: false },
    { type: "module", pattern: `${src}/modules/*`, capture: ["module"], partialMatch: false },
  ];

  const files = [
    { pattern: arch.doors.map((d) => `${src}/modules/*/${d}`), category: "door" },
    { pattern: "**/*.tables.ts", category: "tables" },
    { pattern: "**/*.repository.ts", category: "repository" },
    { pattern: "**/*.service.ts", category: "service" },
    { pattern: "**/*.rules.ts", category: "rules" },
    { pattern: `${src}/modules/*/components/**`, category: "component" },
    { pattern: `${src}/clients/*/providers/**`, category: "provider" },
    { pattern: `${src}/shared/db.ts`, category: "db" },
    { pattern: `${src}/shared/{db,auth,env}.ts`, category: "shared-server" },
  ];

  const type = (/** @type {string} */ t, captured = undefined) => ({
    element: captured ? { type: t, captured } : { type: t },
  });
  const category = (/** @type {string} */ c) => ({ file: { categories: c } });

  /** @type {object[]} last matching policy wins, so exceptions come last */
  const policies = [
    {
      disallow: { to: { ...type("module"), file: { categories: { noneOf: ["door"] } } } },
      message: `Enter a module only through its doors (${arch.doors.join(", ")}), never its internals`,
    },
    {
      disallow: { to: category("tables") },
      message: "Only the owning module imports a table file (read exceptions: architecture.json)",
    },
    {
      disallow: { to: category("provider") },
      message: "Providers are imported only inside their client folder; use the client's index",
    },
    ...owners.map((name) => ({
      from: type("module", { module: name }),
      disallow: {
        to: type("module", { module: `!(${[name, ...allowedTargets(arch, name)].join("|")})` }),
      },
      message: `${name} may not depend on this module: declare the edge in architecture.json or move the responsibility`,
    })),
    ...["repository", "service", "db"].map((c) => ({
      from: category("rules"),
      disallow: { to: category(c) },
      message: "Rules are pure: no database, repository or service",
    })),
    {
      from: category("rules"),
      disallow: { to: type("app") },
      message: "Rules are pure: they never import src/app",
    },
    {
      from: { element: { types: ["module", "shared", "ui", "client"] } },
      disallow: { to: type("app") },
      message: "Nothing imports src/app",
    },
    {
      from: type("ui"),
      disallow: { to: { element: { types: ["module", "client", "app"] } } },
      message: "src/ui is the design system: it never imports modules, clients or app code",
    },
    {
      from: type("ui"),
      disallow: { to: category("shared-server") },
      message: "src/ui never imports server code (db, auth, env)",
    },
    {
      from: type("shared"),
      disallow: { to: { element: { types: ["module", "app"] } } },
      message: "src/shared never imports modules or app code",
    },
    ...["repository", "tables", "db"].map((c) => ({
      from: category("component"),
      disallow: { to: category(c) },
      message: "Components get data through props, never from a repository, tables or the database",
    })),
    ...["repository", "tables", "db"].map((c) => ({
      from: type("app"),
      disallow: { to: category(c) },
      message: "app/ goes through a module's server.ts: no repository, tables or db",
    })),
    // Declared read exceptions: allowed only where the edge is declared as well.
    ...owners.flatMap((reader) =>
      tableOwnersReadBy(arch, reader)
        .filter((owner) => allowedTargets(arch, reader).includes(owner))
        .map((owner) => ({
          from: type("module", { module: reader }),
          allow: { to: { ...type("module", { module: owner }), ...category("tables") } },
        })),
    ),
  ];

  const pure = `Rules are pure: pass time, randomness and config in from the service`;
  return [
    {
      name: "architecture/boundaries",
      files: [`${src}/**/*.{ts,tsx}`],
      // tests may reach into a module to seed and inspect data
      ignores: [`${src}/**/*.test.{ts,tsx}`],
      plugins: { boundaries },
      settings: {
        "boundaries/elements": elements,
        "boundaries/files": files,
        "import/resolver": { typescript: { project: tsconfig } },
        ...(options.rootPath ? { "boundaries/root-path": options.rootPath } : {}),
      },
      rules: { "boundaries/dependencies": ["error", { default: "allow", policies }] },
    },
    {
      name: "architecture/rules-purity",
      files: [`${src}/**/*.rules.ts`],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              { group: ["next", "next/*", "react", "react-dom", "server-only"], message: pure },
            ],
          },
        ],
        "no-restricted-syntax": [
          "error",
          { selector: "MemberExpression[object.name='Date'][property.name='now']", message: pure },
          {
            selector: "MemberExpression[object.name='Math'][property.name='random']",
            message: pure,
          },
          {
            selector: "MemberExpression[object.name='process'][property.name='env']",
            message: pure,
          },
          { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: pure },
        ],
      },
    },
  ];
}
