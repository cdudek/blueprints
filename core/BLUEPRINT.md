---
name: core
description: The stack-agnostic briefing an AI agent follows to set up and grow a new product
read-when: starting a new product, or changing how an existing product is set up
skip-when: a one-line fix that touches no convention
---

# Core blueprint

This is the briefing you would otherwise repeat at the start of every project. Read this file first, then open a reference only when you reach its step. The references hold the rules, the reasons behind them and the checks that keep them true.

It describes, it does not implement. Use the latest stable version of every tool at build time and read its current docs before writing code. Where a stack blueprint exists (`nextjs/`, `fastapi/`), it applies this core to that stack and wins on stack details.

## Rules that override everything

1. **Ask before breaking once live.** In the dev phase (no real users and no data worth keeping), break freely. The live phase starts on the first user outside the team, the first real customer data or the first public launch, whichever comes first; from then on every change to schema, APIs, events, job payloads, URLs or MCP tools stays backwards compatible. Before any breaking change, ask exactly: "This change breaks existing behaviour: <what breaks, for whom>. Are we live, and may I break this? If yes, I will do it as a recorded exception. If no, I will do it in compatible steps (expand, migrate, contract)." See [compatibility](references/compatibility.md).
2. **Docs win over code.** When code and PRODUCT.md, DESIGN.md or a rule disagree, change the code or change the doc on purpose. Never let them drift.
3. **One way to do each thing.** One env module, one client per external service, one event registry, one head pipeline, one `ui/`. A second way is a defect.
4. **Every rule has a check or says it has none.** Enforce what can be enforced in CI. Write down what is left to review.
5. **Never read secret values.** Agents handle secret names and metadata, never values or `.env` files. See [env-and-secrets](references/env-and-secrets.md).

## Build order for a new product

Follow the steps in order. Each step names the references to read.

1. **Product.** Write PRODUCT.md with the owner: who it is for, their hopes and dreams, what it will not do, the vocabulary. [product](references/product.md), [copy](references/copy.md)
2. **Agent files.** Create CLAUDE.md, AGENTS.md, REVIEW.md, `docs/rules.md`, `docs/adr/` and the hooks. [agent-files](references/agent-files.md), [decisions](references/decisions.md)
3. **Stack and structure.** Pick the stack blueprint, lay out modules, `ui/`, `clients/`, `i18n/`. Add the verify command and minimal CI (format, lint, typecheck, test, one required check) before any other code, with the anti-slop lint rules installed. [stack](references/stack.md), [structure](references/structure.md), [naming](references/naming.md), [ci](references/ci.md), [code-quality](references/code-quality.md)
4. **Design and UX.** Write DESIGN.md and `docs/ux/` (interaction, information architecture, glossary, sitemap). Build the central `ui/` before the first screen. [design](references/design.md), [ux](references/ux.md), [interaction](references/interaction.md)
5. **Data.** Postgres, the ORM, repositories per module, the first migration. [data-and-migrations](references/data-and-migrations.md)
6. **Config and secrets.** One env module, `.env.example`, Secret Manager, keyless CI. [env-and-secrets](references/env-and-secrets.md)
7. **External services.** Every networked vendor behind an interface and a factory with a fake provider. [clients](references/clients.md), [email](references/email.md)
8. **Sign-in and access.** Magic link, email and password, Google. Access checks in layers. [auth](references/auth.md), [security](references/security.md)
9. **Public surface.** Forms, SEO and GEO, i18n, tracking, legal pages. [forms](references/forms.md), [seo](references/seo.md), [i18n](references/i18n.md), [tracking](references/tracking.md), [legal](references/legal.md)
10. **Full quality gates.** Every test layer in the verify command, scanners, AI review, the required check complete. [testing](references/testing.md), [ci](references/ci.md)
11. **Ship.** Container, health endpoints, staging, production, logs. [release-and-deploy](references/release-and-deploy.md), [observability](references/observability.md)
12. **MCP, when the product exposes one.** [mcp](references/mcp.md)

A product is ready for its first user when every step is done, the verify command passes, the legal pages are filled and reviewed, and production serves the expected build.

## Files every product carries

```text
CLAUDE.md, AGENTS.md      how agents work here; links everything below
REVIEW.md                 what the AI reviewer checks
PRODUCT.md                who, why, what not, vocabulary
DESIGN.md                 tokens, type, components, do and don't
docs/rules.md             product rules as Given/When/Then, each naming its test
docs/adr/                 decisions with their rejected alternatives
docs/working-agreements.md  dated owner decisions
docs/ux/                  interaction.md, information-architecture.md, glossary, sitemap
.env.example              every config key, explained
```

## Changing an existing product

Find the reference for the area you touch, follow its "How to apply" for changes, and run its checks. When a rule here no longer fits a product, record the exception as an ADR in that product. When it no longer fits any product, change this blueprint.

## All references

product, design, ux, interaction, copy, structure, clients, stack, data-and-migrations, compatibility, auth, security, forms, email, env-and-secrets, naming, code-quality, i18n, tracking, seo, legal, agent-files, decisions, testing, ci, release-and-deploy, observability, mcp. All live in [references/](references/).
