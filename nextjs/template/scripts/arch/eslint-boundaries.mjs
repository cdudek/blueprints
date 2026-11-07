// Builds the eslint-plugin-boundaries config (plus the rules-purity syntax bans) from
// architecture.json. eslint.config.mjs imports this, so there is no second hand-kept list.
// The same historical baseline that the architecture tests read is turned into exact
// (file -> file) allow policies here, so brownfield debt is admitted once, in one place.
import boundaries from "eslint-plugin-boundaries";
import {
  allowedTargets,
  doorFiles,
  layoutOf,
  moduleNames,
  moduleOf,
  STORYBOOK_PACKAGES,
} from "./lib.mjs";

const SHARED_NO_IO =
  "src/shared does no I/O: read the session or the database in a module (accounts), not here";
const STORIES = "A story is an entry for Storybook, never imported by production code";
const GLOBAL_CSS =
  "Global CSS has two owners, src/ui and the root layout: use a ui component or a .module.css";
const PROVIDERS = "Render providers in app/_shell/providers.tsx, the one place they are composed";
const PROVIDERS_IMPORT = "Only a root layout renders the providers file";
const COPY =
  "User-visible text is written in code: put it in messages/<locale>.json and read it with next-intl (src/ui takes text through props)";
const copyAttribute = "JSXAttribute[name.name=/^(alt|title|placeholder|aria-label)$/]";
/** copy-from-messages: text in JSX and literal user-visible attributes. */
const copySelectors = [
  { selector: "JSXText[value=/\\p{L}/u]", message: COPY },
  { selector: `${copyAttribute} > Literal[value=/\\p{L}/u]`, message: COPY },
  {
    selector: `${copyAttribute} > JSXExpressionContainer > Literal[value=/\\p{L}/u]`,
    message: COPY,
  },
];
const PURE = "Rules are pure: pass time, randomness and config in from the service";
const BANNED_GLOBALS = [
  "fetch",
  "process",
  "crypto",
  "performance",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "globalThis",
  "require",
];

/**
 * Baseline lines look like `rule|file|target#n`. Dependency findings have a project file as target.
 * @param {string[]} baseline @param {string} [src] srcRoot
 */
export function baselinedDependencies(baseline, src = "src") {
  /** @type {{ file: string, target: string }[]} */
  const pairs = [];
  const projectFile = new RegExp(`^${src}/[^ ]*\\.tsx?$`);
  for (const key of baseline) {
    const [, file, target] = key.replace(/#\d+$/, "").split("|");
    if (file && target && projectFile.test(target)) pairs.push({ file, target });
  }
  return pairs;
}

/**
 * @param {import("./lib.mjs").Architecture} arch
 * @param {{ tsconfig?: string, rootPath?: string, baseline?: string[] }} [options]
 * @returns {import("eslint").Linter.Config[]}
 */
export function buildBoundariesConfig(arch, options = {}) {
  const src = arch.srcRoot;
  const L = layoutOf(arch);
  const at = (/** @type {string} */ p) => `${src}/${p}`;
  const tsconfig = options.tsconfig ?? "./tsconfig.json";
  const owners = moduleNames(arch);
  const doors = doorFiles(arch);

  // Every production file must fit one of these. Anything else is reported as unknown.
  const elements = [
    { type: "app", pattern: at(L.app), partialMatch: false },
    { type: "ui", pattern: at(L.ui), partialMatch: false },
    { type: "shared", pattern: at(L.shared), partialMatch: false },
    { type: "db", pattern: at(L.db), partialMatch: false },
    { type: "i18n", pattern: at(L.i18n), partialMatch: false },
    // message catalogs (messages/<locale>.json) sit beside src/, read through src/i18n only
    { type: "messages", pattern: "messages", partialMatch: false },
    { type: "client", pattern: at(`${L.clients}/*`), capture: ["client"], partialMatch: false },
    { type: "module", pattern: at(`${L.modules}/*`), capture: ["module"], partialMatch: false },
  ];

  const files = [
    { pattern: doors.map((d) => at(`${L.modules}/*/${d}`)), category: "door" },
    {
      pattern: doorFiles(arch, "browser").map((d) => at(`${L.modules}/*/${d}`)),
      category: "browser-door",
    },
    {
      pattern: L.compositionFolders.map((c) => at(`${L.app}/**/${c}/**`)),
      category: "composition",
    },
    { pattern: at(L.providers), category: "providers" },
    {
      pattern: [
        at(`${L.app}/layout.tsx`),
        at(`${L.app}/\\(*\\)/layout.tsx`),
        at(`${L.app}/\\[*\\]/layout.tsx`),
      ],
      category: "root-layout",
    },
    { pattern: "**/*.tables.ts", category: "tables" },
    { pattern: "**/*.repository.ts", category: "repository" },
    { pattern: "**/*.service.ts", category: "service" },
    { pattern: "**/*.rules.ts", category: "rules" },
    { pattern: at(`${L.modules}/*/components/**`), category: "component" },
    { pattern: at(`${L.clients}/*/providers/**`), category: "provider" },
    { pattern: at(`${L.db}/**`), category: "db" },
    // allowed root files (for example proxy.ts): classified, so nothing else sits loose in src;
    // the worker is the one root that may call operations
    ...arch.roots.map((file) => ({
      pattern: `${src}/${file}`,
      category: file === L.worker ? "worker" : "root",
    })),
  ];

  const type = (/** @type {string} */ t, captured = undefined) => ({
    element: captured ? { type: t, captured } : { type: t },
  });
  const category = (/** @type {string} */ c) => ({ file: { categories: c } });
  const sameModule = {
    element: { type: "module", captured: { module: "{{ from.element.captured.module }}" } },
  };

  /** The last matching policy decides, so broad refusals come first and exceptions last. */
  const policies = [
    {
      disallow: { to: { ...type("module"), file: { categories: { noneOf: ["door"] } } } },
      message: `Enter a module only through its doors (${doors.join(", ")}), never its internals`,
    },
    {
      disallow: { to: category("tables") },
      message: "Only the owning module imports a table file (read exceptions: architecture.json)",
    },
    {
      disallow: { to: category("provider") },
      message: "Providers are imported only inside their client folder; use the client's index",
    },
    {
      from: type("client"),
      allow: {
        to: {
          element: { type: "client", captured: { client: "{{ from.element.captured.client }}" } },
        },
      },
    },
    // dependencies inside one module are checked too (checkInternals): allowed unless a role rule below says no
    { from: type("module"), allow: { to: sameModule } },
    ...owners.map((name) => ({
      from: type("module", { module: name }),
      disallow: {
        to: type("module", { module: `!(${[name, ...allowedTargets(arch, name)].join("|")})` }),
      },
      message: `${name} may not depend on this module: declare the edge in architecture.json or move the responsibility`,
    })),
    // the persistence composition root: table files of every module, nothing else
    { from: type("db"), allow: { to: category("tables") } },
    {
      from: type("db"),
      disallow: { to: { ...type("module"), file: { categories: { noneOf: ["tables"] } } } },
      message: "src/db imports table files only, never a module's code",
    },
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
      from: { element: { types: ["module", "shared", "ui", "client", "db"] } },
      disallow: { to: type("app") },
      message: "Nothing imports src/app",
    },
    {
      from: category("root"),
      disallow: { to: type("module") },
      message: `Root files (${arch.roots.filter((r) => r !== L.worker).join(", ")}) import no module: only ${L.worker} and app/ call operations`,
    },
    {
      from: type("ui"),
      disallow: { to: { element: { types: ["module", "client", "app", "db", "shared", "i18n"] } } },
      message:
        "src/ui is the project's design system and a leaf: it never imports modules, shared, i18n, clients, db or app code",
    },
    {
      disallow: { to: type("messages") },
      message: "Message catalogs are read through src/i18n (next-intl), never imported directly",
    },
    { from: type("i18n"), allow: { to: type("messages") } },
    // the providers file is rendered by root layouts only
    { disallow: { to: category("providers") }, message: PROVIDERS_IMPORT },
    { from: category("root-layout"), allow: { to: category("providers") } },
    {
      from: type("shared"),
      disallow: { to: { element: { types: ["module", "app", "db"] } } },
      message: "src/shared never imports modules, db or app code",
    },
    {
      from: type("shared"),
      disallow: { to: type("client") },
      message: "src/shared never imports a client: the module that owns the vendor calls it",
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
    // composition folders: src/ui, browser doors and other composition files; data and actions as props
    {
      from: category("composition"),
      disallow: { to: { element: { types: ["module", "shared", "db", "client", "app"] } } },
      message:
        "A composition folder imports only src/ui, src/i18n, browser doors and other composition files: the page passes data and actions as props",
    },
    { from: category("composition"), allow: { to: category("browser-door") } },
    { from: category("composition"), allow: { to: category("composition") } },
    { from: category("composition"), allow: { to: type("i18n") } },
    // Declared read exceptions: one reader FILE, one owner module's tables (names are checked
    // by the architecture tests; an import check cannot tell a read from a write).
    ...arch.readExceptions.flatMap((x) => {
      const reader = moduleOf(arch, x.file);
      const owner = arch.tables[x.table];
      if (!reader || !owner || !allowedTargets(arch, reader).includes(owner)) return [];
      return [
        {
          from: { file: { path: x.file } },
          allow: { to: { ...type("module", { module: owner }), ...category("tables") } },
        },
      ];
    }),
    // Historical debt: exact (file -> file) pairs from the shared baseline. Additions are refused
    // by the baseline-shrinks check; multiplicity is enforced by the architecture tests.
    ...baselinedDependencies(options.baseline ?? [], src).map(({ file, target }) => ({
      from: { file: { path: file } },
      allow: { to: { file: { path: target } } },
    })),
  ];

  // Import bans. ESLint keeps one option set per rule and file, so each file group gets the
  // whole list that applies to it, built from the same parts.
  const escape = (/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** @typedef {{ paths?: object[], patterns?: object[] }} Ban */
  /** @param {{ name: string, message: string }[]} names @returns {Ban} */
  const packages = (names) => ({
    paths: names,
    patterns: names.map(({ name, message }) => ({ group: [`${name}/*`], message })),
  });
  const banned = packages(
    Object.entries(arch.bannedPackages ?? {}).map(([name, reason]) => ({
      name,
      message: `${name} is banned here: ${reason}`,
    })),
  );
  const stories = {
    patterns: [{ regex: "\\.stories(\\.[jt]sx?)?$", message: STORIES }],
  };
  const icons = packages(
    (arch.iconPackages ?? []).map((name) => ({
      name,
      message: `Import icons from @/${L.ui}/icons, the one place ${name} is imported`,
    })),
  );
  const css = { patterns: [{ regex: "^(?!.*\\.module\\.css$).*\\.css$", message: GLOBAL_CSS }] };
  const sharedIo = packages(
    arch.serverOnlyPackages
      .filter((p) => p !== "server-only")
      .map((name) => ({ name, message: SHARED_NO_IO })),
  );
  /** @param {string[]} extra packages allowed on top of uiMayImport */
  const uiLeaf = (extra = []) =>
    arch.uiMayImport
      ? {
          patterns: [
            {
              regex: `^(?!(?:\\.|@/${escape(L.ui)}/|(?:${[...arch.uiMayImport, ...extra].map(escape).join("|")})(?:/|$)))`,
              message: `src/ui is a leaf: it imports only src/ui and ${arch.uiMayImport.join(", ")} (uiMayImport)`,
            },
          ],
        }
      : {};
  const uiPackages = uiLeaf();
  // a story is a Storybook entry: it may also import Storybook itself
  const storyPackages = uiLeaf(STORYBOOK_PACKAGES);
  const pure = {
    patterns: [
      { group: ["next", "next/*", "react", "react-dom", "server-only", "node:*"], message: PURE },
    ],
  };
  /** @param {Ban[]} parts */
  const bans = (...parts) => [
    "error",
    {
      paths: parts.flatMap((p) => p.paths ?? []),
      patterns: parts.flatMap((p) => p.patterns ?? []),
    },
  ];
  const general = [banned, stories];
  const rootLayouts = [
    at(`${L.app}/layout.tsx`),
    at(`${L.app}/\\(*\\)/layout.tsx`),
    at(`${L.app}/\\[*\\]/layout.tsx`),
  ];
  const importBans = [
    { files: [`${src}/**/*.{ts,tsx}`], bans: bans(...general, icons, css) },
    { files: rootLayouts, bans: bans(...general, icons) },
    { files: [at(`${L.shared}/**/*.{ts,tsx}`)], bans: bans(...general, icons, css, sharedIo) },
    { files: [at(`${L.ui}/**/*.{ts,tsx}`)], bans: bans(...general, icons, uiPackages) },
    { files: [at(`${L.ui}/icons/**/*.{ts,tsx}`)], bans: bans(...general, uiPackages) },
    { files: [at(`${L.ui}/**/*.stories.tsx`)], bans: bans(banned, icons, storyPackages) },
  ].map(({ files, bans: rule }, i) => ({
    name: `architecture/import-bans-${i}`,
    files,
    ignores: [`${src}/**/*.test.{ts,tsx}`],
    rules: { "no-restricted-imports": rule },
  }));

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
      rules: {
        "boundaries/dependencies": ["error", { default: "allow", checkInternals: true, policies }],
        // a file that fits no declared element, or a dependency on one, is an error
        "boundaries/no-unknown-files": "error",
        "boundaries/no-unknown-dependencies": "error",
      },
    },
    ...importBans,
    {
      name: "architecture/rules-purity",
      files: [`${src}/**/*.rules.ts`],
      rules: {
        "no-restricted-imports": bans(general, css, pure),
        "no-restricted-globals": [
          "error",
          ...BANNED_GLOBALS.map((name) => ({ name, message: PURE })),
        ],
        "no-restricted-syntax": [
          "error",
          { selector: "MemberExpression[object.name='Date']", message: PURE },
          {
            selector: "MemberExpression[object.name='Math'][property.name='random']",
            message: PURE,
          },
          {
            selector: "MemberExpression[object.name='Math'][property.value='random']",
            message: PURE,
          },
          { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: PURE },
          { selector: "VariableDeclarator[init.name='Date']", message: PURE },
        ],
      },
    },
    {
      // app/ files also carry the copy selectors: ESLint keeps one option set per rule and file
      name: "architecture/providers-composed-once",
      files: [at(`${L.app}/**/*.tsx`)],
      ignores: [at(L.providers), "**/*.stories.tsx", "**/*.test.tsx"],
      rules: {
        "no-restricted-syntax": [
          "error",
          { selector: "JSXOpeningElement[name.name=/Provider$/]", message: PROVIDERS },
          { selector: "JSXOpeningElement[name.property.name=/Provider$/]", message: PROVIDERS },
          ...copySelectors,
        ],
      },
    },
    {
      name: "architecture/copy-from-messages",
      files: [at(L.providers), at(`${L.ui}/**/*.tsx`), at(`${L.modules}/*/components/**/*.tsx`)],
      ignores: ["**/*.stories.tsx", "**/*.test.tsx"],
      rules: { "no-restricted-syntax": ["error", ...copySelectors] },
    },
    {
      name: "architecture/doors-no-client-directive",
      files: [...doors.map((d) => at(`${L.modules}/*/${d}`)), at(`${L.ui}/icons/index.ts`)],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "Program > ExpressionStatement[directive='use client']",
            message:
              'A door is not a client boundary: put "use client" on the component file that needs it',
          },
        ],
      },
    },
  ];
}
