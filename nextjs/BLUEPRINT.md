---
name: nextjs
description: The Next.js and TypeScript additions to core for a modular monolith with App Router and Postgres
read-when: starting a Next.js product, adopting this structure in an existing app, or changing a Next.js boundary or convention
skip-when: working on another stack, or a one-line fix that touches no convention
---

# Next.js blueprint

Read [core](../core/BLUEPRINT.md) first. This blueprint maps its rules to Next.js App Router, strict TypeScript and Postgres. It adds framework details; product, compatibility, security and delivery rules remain in core. Use it for a web product with a server-rendered public surface, a signed-in app or both. A Python runtime needs the justification in [core stack](../core/references/stack.md).

This is documentation, not a project to copy. The agent creates the application in the product's repository with the latest stable tools at build time, reads their installed documentation, and writes the checks there. Annotated trees below describe the intended product; they are not files shipped by this blueprint.

## How an AI applies it

Follow core's build order. Open the stack reference at the corresponding step, cite its rule IDs in the product's rules and reviews, and implement its checks alongside the first code they cover. Add dependencies as features need them. Never install a whole example stack before the product needs it.

For the TypeScript checks, **NEXT-ARCH-1 applies core ARCH-6 with ArchUnitTS and `architecture.yaml`; NEXT-ARCH-5 applies core STK-21 with Biome for format and lint, and Oxlint only for vendored anti-slop rules.** The rest of core's architecture and quality gates still apply.

## Reading order

| Core step | Next.js reference | What it adds |
| --- | --- | --- |
| Stack and structure | [structure](references/structure.md), [architecture and quality](references/architecture-and-quality.md) | App Router, two module doors, server and client closures, ArchUnitTS, TypeScript and Biome |
| Design and UX | [UI](references/ui.md) | `ui/components`, styleguide, theme, React composition and Storybook placement |
| Data | [data and migrations](references/data-and-migrations.md) | Drizzle or Prisma, schema composition, typed transactions and deploy migrations |
| External services | [clients](references/clients.md) | Factories and provider strategies for email, storage, LLMs and payments |
| Sign-in and access | [auth](references/auth.md) | Better Auth, session ownership, action and route authorization |
| Public surface | [i18n](references/i18n.md), [tracking](references/tracking.md), [SEO](references/seo.md), [legal](references/legal.md) | next-intl, analytics boundaries, Metadata API and public legal routes |
| Full quality gates | [testing](references/testing.md), [performance](references/performance.md) | Unit, real Postgres, Playwright, Storybook, Lighthouse and browser bundle budgets |
| Ship | [release and deploy](references/release-and-deploy.md) | Standalone container, Cloud Run and Cloud SQL, previews and multiple instances |

## Changing an existing app

Read the reference for the area being changed and its linked core rules. Inventory the existing routes, modules, schema owners and client boundaries before moving files. Record the current layout in `architecture.yaml`, adopt checks with the shrinking baseline from core, then move one vertical slice at a time: doors, pure rules, table ownership, delivery layers. A folder rename is not a reason to change public URLs or rewrite migration history.

The former architecture document and runnable example are folded into these references. Useful lessons survive as rules and acceptance cases; the old example's auth stub, incomplete payment provider and unfinished recovery jobs are not production defaults.
