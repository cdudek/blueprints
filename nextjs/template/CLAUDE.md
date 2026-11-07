# Notes for coding agents

This project follows a modular-monolith architecture. Read [ARCHITECTURE.md](../ARCHITECTURE.md)
(in the blueprint repo; copy it into `docs/` when you adopt the template) before adding code.
`architecture.json` is the policy; CI enforces it. `pnpm check` is the full gate.

## Where new code goes

- **A new business capability:** `pnpm new:module <plural-name>`. It creates the module, declares
  it and its table in `architecture.json`, and composes the table into `src/db/schema.ts`.
  Then `pnpm db:generate` for the migration.
- **A page, action or route handler:** `src/app/[locale]/` (routes under `src/app/api/`).
  Actions are `"use server"` files that only `safeParse` input, read the session through
  `@/modules/accounts/server`, call one operation or one workflow, revalidate and return a small
  DTO. A user operation takes the session as its first argument.
- **A process across modules:** `src/app/_workflows/<name>.ts`, with the header block
  (`@workflow <name>`, `retry-safe:`, `duplicates:`, `recovery:`, `survives-restart:`) at the top
  of the file, answered for this workflow. Actions and routes call it.
- **Page parts and shared chrome:** `src/app/<route>/_components/` and `src/app/_shell/`. They
  import `src/ui`, browser doors (`public.ts`) and each other only; the page passes data and
  actions in as props. Providers are rendered only in `src/app/_shell/providers.tsx`; navigation
  lives in `src/app/_shell/nav.ts`.
- **Background work:** a `job` operation in the owning module, called from `src/worker.ts` (a
  graphile-worker task or cron entry). Never run a queue in the web process.
- **Business logic:** `<module>/<x>.service.ts`. Every exported operation is wrapped in
  `operation({ access: ... }, ...)` and returns a `Result` with a typed error.
- **Queries:** `<module>/<x>.repository.ts`. Private to the module. Takes an optional `DbClient`.
- **Pure decisions** (pricing, eligibility, allowed transitions): `<module>/<x>.rules.ts`. No
  database, no clock, no randomness, no environment: pass them in.
- **Tables:** `<module>/<x>.tables.ts`, declared in `architecture.json`. Only the owner imports
  them. Cross-module foreign keys live in a reviewed custom migration in `drizzle/`.
- **A call to another module:** import its `server.ts` (service calls) or `public.ts`
  (browser-safe types, schemas, components) and declare the edge in `architecture.json`.
- **A third-party service:** `src/clients/<name>/` with `base.ts`, `factory.ts` and
  `providers/{fixture,noop,real}.ts`. Tests never reach a live API.
- **UI:** `src/ui` is this project's own design system and a leaf: no business nouns, no import
  of a module, `src/shared`, a client or `src/db`, and only the packages in `uiMayImport`. Import
  each component by its file (`@/ui/Button`); there is no barrel. Icons come from `@/ui/icons`,
  generic hooks from `src/ui/hooks`, styling is Tailwind with the tokens in
  `src/ui/styles/theme.css` and `cva` variants. Business components go in `<module>/components/`.
  Stories sit beside `src/ui` components (`Button.stories.tsx`).
- **Words the user sees:** `messages/en.json`, read with next-intl. Never write user-visible text
  in JSX or in `alt`, `title`, `placeholder` or `aria-label`; `src/ui` takes text through props.
- **Never add:** a top-level `hooks/`, `utils/`, `lib/`, `types/`, `config/`, `contexts/` or
  `stores/` folder, axios, or Redux. The architecture check says where each thing goes instead.
- **A webhook or job operation** (`access: "webhook" | "job"`): callable only from a route
  handler, never from an action, page or component.

## Rules of thumb

- Never edit `quality/*-baseline.json` to make a check pass. A baseline only shrinks;
  `pnpm arch:baseline:write` is for adopting the blueprint, in a reviewed commit.
- Never add `export *` to a door, or export a repository or a table from one.
- Run `pnpm check` before pushing; it is the same set of scripts CI runs.
