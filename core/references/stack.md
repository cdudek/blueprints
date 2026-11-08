---
name: stack
description: The default libraries and runtime for a new product, how to pick versions, when Python/FastAPI is justified, and how to deviate.
read-when: starting a product, adding a dependency, or tempted to use a library or language not named here.
skip-when: working inside an already chosen stack and adding no dependency.
---

# Stack

The default stack is TypeScript, Next.js App Router as a modular monolith, and Postgres. The libraries below are the named defaults. The one idea: use the default unless a written reason says otherwise, so every product looks the same to an agent and a new product starts fast.

## Rules

### Defaults

- **STK-1 Runtime and framework.** TypeScript in strict mode, Next.js App Router, Node. One deployable app, one codebase. Structure follows [structure](structure.md).
- **STK-2 Database.** Postgres. ORM: drizzle by default, Prisma as the alternative. See [data-and-migrations](data-and-migrations.md).
- **STK-3 UI.** shadcn on Radix primitives, Tailwind, `lucide-react` icons, `class-variance-authority` and `tailwind-merge` for variants. Animation with `motion`. Toasts with `sonner`. All of it behind the central `ui/` folder, see [design](design.md).
- **STK-4 Validation.** zod, parsed at the edge, one schema per input.
- **STK-5 i18n.** next-intl, every string a message key from day one. See [i18n](i18n.md).
- **STK-6 Auth.** Better Auth. Magic link by email, email and password, Google OAuth, one user per verified email, methods linkable. See [auth](auth.md).
- **STK-7 Email.** Resend for delivery, react-email for templates, behind a client. See [email](email.md).
- **STK-8 Flags and analytics.** OpenFeature as the flag API in code, PostHog as the flag backend. PostHog for analytics. See [tracking](tracking.md).
- **STK-9 MCP.** The official MCP TypeScript SDK, inside the same app as one more delivery layer. See [mcp](mcp.md).
- **STK-10 Hosting.** Containers: one image per app, config from env. GCP Cloud Run with Cloud SQL Postgres and Terraform first, the owner's Kubernetes cluster later. See [release-and-deploy](release-and-deploy.md).
- **STK-11 Tests.** A unit and integration runner in the TypeScript ecosystem, Playwright for end to end, a real Postgres for data tests. See [testing](testing.md).
- **STK-21 Lint and format.** Biome handles TypeScript linting and formatting. Oxlint runs only the vendored anti-slop rules in the separate `slop` target; it does not duplicate general linting. See [code-quality](code-quality.md).

### Versions

- **STK-12 Latest stable at build time.** Take the newest stable release of each library when the product is created, never a pre-release, never a version copied from an older product. Commit the lockfile. Do not write version numbers in blueprints or docs.
- **STK-13 The framework may be newer than the agent's knowledge.** Before using a framework API, read the documentation bundled with the installed version. When code and memory disagree, the installed version wins.
- **STK-14 One package manager per product**, named in the agent files, with exact commands that exist.
- **STK-15 Dependencies are added deliberately.** A new dependency needs a reason a reviewer can read: what it does, why the platform or an installed library cannot. Prefer fewer, maintained, widely used packages. Never add a dependency for a few lines of code.

### Python and FastAPI

- **STK-16 Python/FastAPI only when the product needs it.** Justified when the work is dominated by a Python-only ecosystem (data science, ML training, scientific or document processing libraries), a long-running compute service that does not fit a web process, or an existing Python system being wrapped. Not justified by preference, by one library that has a TypeScript equivalent, or by "backend should be separate".
- **STK-17 Python lives in its own service folder** with its own container and a typed contract (generated schema, drift-checked in CI). The TypeScript app stays the product. The same structure rules apply: modules, doors, operations, [clients](clients.md).
- **STK-18 A second runtime is added for a runtime reason, never for structure.** Module boundaries inside one app are cheaper than a network boundary.

### Deviating

- **STK-19 A deviation is allowed, never silent.** Using a different library, runtime or host than named here is fine when it fits the product better. Record it as an ADR before the code lands (see [decisions](decisions.md)): the default, the choice, the alternatives rejected, the reason, and what would make us revisit.
- **STK-20 Deviations are cited where they bite.** The agent files list the deviation, so a later agent does not "fix" it back to the default.

## How to apply

New product:

1. Create the app with the framework's own scaffolder, then add the defaults above one by one as features need them. Do not install the whole list on day one.
2. Resolve each version at that moment from the package registry (latest stable). Commit the lockfile.
3. Write the chosen package manager, the verify command and the dev command into the agent files (see [agent-files](agent-files.md)).
4. If the product needs Python, write the ADR under STK-16 first, then create the service folder.
5. If you pick anything outside the defaults, write the ADR before adding it.

Changing later: upgrade in small separate PRs, one major library at a time, with the migration guide open. A tool upgrade that changes check results is its own PR. Remove a dependency when its last use goes.

## Checks

Automatic:

- Lockfile committed and in sync (frozen install in CI).
- Unused dependencies, exports and files fail the build.
- Dependency update bot runs weekly against the real lockfile.
- Typecheck covers all source code, including config and scripts.
- Audit and license scan in CI.

Review: that each new dependency has a reason, that a deviation has an ADR, and that Python is justified by STK-16.

## Mistakes to avoid

- Copying versions from an older product, then shipping known-old libraries.
- Writing new framework code from memory against an API that changed in the installed version.
- Adding a second language "for the backend" and paying for two toolchains, two images and a contract for no runtime reason.
- Two libraries doing one job (two form libraries, two date libraries) because two agents chose differently.
- A deviation that lives only in a chat. The next agent reverts it.
- Installing every default before any feature needs it.
- A global state library added to hold server data. Server state lives in server components and actions, client state in component state or the URL.
