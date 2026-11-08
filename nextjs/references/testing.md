---
name: nextjs-testing
description: Unit and Postgres integration tests, production-build Playwright journeys and isolated Storybook checks
read-when: creating a test layer, fixing a bug, adding a component or verifying a Next.js delivery boundary
skip-when: editing prose that no product check reads
---

# Testing

Apply [core testing](../../core/references/testing.md). This reference maps its layers to TypeScript and App Router. Tests execute real code; source scans are named architecture or guard checks, not substitutes for behavior.

## Rules

- **NEXT-TEST-1 Colocate unit tests with their owner.** Use Vitest or the product's chosen TypeScript runner for pure rules, schemas and component behavior. `*.test.ts` or `*.test.tsx` moves with its module. Rule tests pass time and randomness as inputs. A separate architecture suite checks the whole project without booting the app.
- **NEXT-TEST-2 Data tests run real Postgres.** Migrate it through the production migration path, use concrete repositories and fake only external providers. A JavaScript database mock or in-process substitute cannot prove Postgres constraints, locking or migrations. Concurrent and worker tests commit in an isolated database so other connections see the data; do not wrap them in an invisible rollback transaction.
- **NEXT-TEST-3 Playwright runs the production build.** Build and start the same runtime used by the container, wait for readiness and isolate data per run. Cover signed-out and signed-in journeys, wrong-owner access, action error states, locale navigation, keyboard use and axe on real pages. Test actions through the UI and HTTP entry points through their requests; direct service tests alone do not prove the adapter is safe.
- **NEXT-TEST-4 Auth and providers use explicit test composition.** A mail harness captures real sign-in messages and follows their links. Providers are deterministic; unit and integration network calls throw unless explicitly supplied. Playwright may call its local app and harness, while vendor traffic remains faked. Configuration tests prove the real production environment refuses test providers regardless of `NODE_ENV` or a test flag.
- **NEXT-TEST-5 Storybook tests the shared UI contract.** Stories sit beside `ui/components/` and use the real theme, representative props and all meaningful states. Use the current Next.js-compatible Storybook framework and accessibility integration; exercise every story in CI. Keep it props-driven without a database or live SDK. Next.js routing, server rendering and actions are verified in Playwright rather than simulated by a story.
- **NEXT-TEST-6 Boundary edits require the framework build.** Tests for a transitive client leak and a non-async export from an action file must fail for the intended boundary. Verify both the semantic guard and a production build; TypeScript and a mocked component runner can both pass code Next.js rejects. A test setup alias for `server-only` must never disable the architecture or production-build guard.
- **NEXT-TEST-7 Test the shipped processes.** Smoke the final image, migration job and any worker with real Postgres under production restrictions. Cover migration replay, readiness failure and recovery, build identity and durable work after a process restart. The recovery cases in [clients](clients.md) are acceptance cases, not a claim that a sample payment flow is complete.

## How to apply

Start with unit and guard tests, then Postgres integration, then Playwright and Storybook as the first screens and primitives appear. Keep `tests/architecture/`, `tests/integration/`, `tests/e2e/` and tooling gate fixtures for tests spanning owners; keep unit tests beside their source. Every layer feeds the single verify command and required CI summary from core.

Changing later: reproduce a bug through the layer where it occurs, see the test fail, then fix it. A framework-boundary change also runs the production build locally before pushing. Keep test selectors tied to accessible roles and user words wherever possible.

## Checks

- Automatic: all layers run, architecture and gate fixtures prove refusal, every story is exercised, e2e serves a production build and tests cannot reach a live vendor.
- Review: journey coverage, whether a test would fail without the fix, real keyboard and zoom verification for changed controls, and remaining browser-specific behavior.

## Mistakes to avoid

- A green typecheck used to skip the Next.js build.
- A worker test that cannot see setup rows because they were never committed.
- Testing a story and claiming the route, session or Server Action works.
