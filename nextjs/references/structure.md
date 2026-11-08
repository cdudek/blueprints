---
name: nextjs-structure
description: App Router delivery layers, TypeScript module doors and the server and client import boundary
read-when: creating the app layout, adding a module, action, route handler or client component, or moving code across a boundary
skip-when: changing copy or styles inside an existing component
---

# Structure

Apply [core structure](../../core/references/structure.md). Next.js is the delivery layer around the modules, not the home of their rules. The two doors make what can run in a browser explicit.

## Rules

- **NEXT-STR-1 App Router files translate the request.** `page.tsx` loads through a module's server door and renders; `actions.ts` parses input, reads the session, calls one operation or workflow, then revalidates or redirects. `route.ts` does the same for HTTP callers. Server Components call operations directly, without fetching the app's own API. Route groups organize layouts without inventing URL prefixes; private `_components` folders hold page composition.
- **NEXT-STR-2 Every module has `server.ts` and `public.ts`.** The server door starts with `import "server-only"` and lists service operations by name. The public door lists browser-compatible types, schemas and components by name, with explicit type exports. Neither exports repositories, tables or wildcard barrels. A public door has no `"use client"` directive; the interactive component owns that directive. Inside the module, use relative imports.
- **NEXT-STR-3 Check the entire client import closure.** Mark services, repositories, the database, server env and network providers `server-only`. No runtime path from a client entry or public door may reach them, including through re-exports and helper files. Put a browser constant in a browser-safe leaf, never re-export it from a server service. Type-only imports are checked separately from runtime imports.
- **NEXT-STR-4 Client boundaries are small and explicit.** Server Components are the default. Put `"use client"` on the smallest interactive file; keep content server-rendered through children or slots. Props crossing the boundary follow React's serialization contract; no ORM objects, vendor instances or ordinary function callbacks. Pass a Server Action reference deliberately, and pass rendered elements rather than component functions as slots.
- **NEXT-STR-5 `"use server"` is for callable actions.** A module server door uses `server-only`, not `"use server"`. An action file exports only async action functions; constants, schemas and synchronous helpers live elsewhere. A successful TypeScript check does not prove that Next.js can build these files. See the [framework's export restriction](https://nextjs.org/docs/messages/invalid-use-server-value).
- **NEXT-STR-6 Request routing is not authorization.** The framework's request interceptor (currently `proxy.ts`) handles locale redirects and headers and imports no business module. Read the installed release's conventions for params, request APIs and caching instead of copying old synchronous APIs. A layout can present an access state, but operations enforce it on every call.
- **NEXT-STR-7 System entry points stay at the outside edge.** Webhook routes verify the signature against the raw body before parsing the verified payload. Cron routes authenticate the scheduler before calling a job operation. Named cross-module workflows live in `app/_workflows/`; durable work runs in a separate worker process or an authenticated scheduled entry point, never a queue loop in the web server. See [clients](clients.md) for replay and recovery cases.

## How to apply

The product's default layout, extending core's tree:

```text
src/
  app/
    [locale]/<route>/    page.tsx, actions.ts, loading.tsx, error.tsx, _components/
    api/<endpoint>/     route.ts: external HTTP, webhooks, health and scheduler adapters
    _shell/             frame, navigation and the one provider composition
    _workflows/         named orchestration over module operations
  modules/<capability>/
    server.ts           server-only operation door
    public.ts           browser-compatible exports, listed by name
    <name>.service.ts   operations and access policies
    <name>.repository.ts, <name>.tables.ts  private persistence
    <name>.rules.ts, <name>.schema.ts, <name>.types.ts
    components/         domain UI with data and actions passed in
  db/                   server-only client, Tx and schema composition
  clients/<service>/    interface, factory, provider strategies
  shared/               core's pure shared contracts and server env reader
  ui/                   components/, styleguide/, theme/, icons/
  i18n/                 routing, request config and navigation
  worker.ts             optional queue process, calls job operations
messages/               typed locale catalogs
architecture.yaml       actual paths, doors, owners, edges and fitness rows
```

Create doors and policy entries before wiring a route. Inject actions into domain components through props, so a module never imports `app/`. Put request-level loading and unexpected-error boundaries beside routes; map typed expected failures to localized UI, and keep framework redirects outside broad error catches.

Changing later: follow the client and server import closures before moving an export. Existing `features/` names can stay when the architecture policy names them; avoid a wholesale rename to satisfy a diagram.

## Checks

- Automatic: [ArchUnitTS and semantic guards](architecture-and-quality.md) enforce doors, declared edges, composition imports, pure rules and server closures. A production Next.js build catches invalid action exports and framework-only constraints.
- Automatic: action, webhook and scheduler behavior tests cover invalid input, missing access, duplicate requests and expected error results.
- Review: DTO contents, operation ownership, correct revalidation scope and whether a boundary moved more code into the browser than necessary.

## Mistakes to avoid

- A helper re-export that drags a server SDK into a client component.
- `"use server"` added to a service file to mean private server code.
- A page that fetches its own route handler, or an action imported back into its module.
