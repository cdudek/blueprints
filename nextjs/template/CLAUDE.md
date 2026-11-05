# Notes for coding agents

This project follows a modular-monolith architecture. Read [ARCHITECTURE.md](../ARCHITECTURE.md)
(in the blueprint repo; copy it into `docs/` when you adopt the template) before adding code.
`architecture.json` is the policy; CI enforces it. `pnpm check` is the full gate.

## Where new code goes

- **A new business capability:** `pnpm new:module <plural-name>`. It creates the module, declares
  it and its table in `architecture.json`, and composes the table into `src/db/schema.ts`.
  Then `pnpm db:generate` for the migration.
- **A page, action or route handler:** `src/app/`. Actions are `"use server"` files that only
  `safeParse` input, call one module's `server.ts` operation, revalidate and return a small DTO.
  A route handler that calls two modules documents the four workflow questions in its header.
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
- **UI:** `src/ui` is this project's own design system (atoms, generic patterns, tokens): no
  business nouns, no module imports. Business components go in `<module>/components/`.
- **A webhook or job operation** (`access: "webhook" | "job"`): callable only from a route
  handler, never from an action, page or component.

## Rules of thumb

- Never edit `quality/*-baseline.json` to make a check pass. A baseline only shrinks.
- Never add `export *` to a door, or export a repository or a table from one.
- Run `pnpm check` before pushing; it is the same set of scripts CI runs.
