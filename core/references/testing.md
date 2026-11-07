---
name: testing
description: Test layers, what each covers, and the rules that make tests mean something: real code, real Postgres, guard tests, failing test first, e2e on a production build.
read-when: writing or changing tests, fixing a bug, adding a rule, or wiring the test layers of a new product.
skip-when: you are only editing prose documents that no test reads.
---

# Testing

Tests are the proof for every rule and every requirement. The idea: a test that cannot fail, or that does not run real code, proves nothing. Fewer tests that fail for the right reason beat many that pass whatever happens.

## Rules

### What a test must be

- **TEST-1: Every test fails without its fix.** Before trusting a new test, remove or break the code it covers and see it fail. A test that passes either way is removed.
- **TEST-2: Tests run real code.** They render the component, call the function, hit the route. Grepping a source file for a string is not a test. A scan of the whole tree is allowed only as a named guard test (TEST-8).
- **TEST-3: Real Postgres, not a fake.** The database is not behind a factory (see [clients](clients.md), [data-and-migrations](data-and-migrations.md)). Tests run against a real Postgres started for the run, with migrations applied the same way as production.
- **TEST-4: The network is stubbed to throw.** In unit and integration tests any outbound call that is not explicitly faked fails the test. External services use their fake provider, or a mock transport, never a patched function deep inside.
- **TEST-5: Tests scrub credentials and cached settings.** No live key from the developer's shell reaches a test, staging included. Settings are cleared between tests.
- **TEST-6: No fixed sleeps, no silent skips.** Wait on a condition. A skipped test needs a reason and an owner. Shrinking coverage needs an explanation in the PR.
- **TEST-7: Test on the runtime the container uses.** Same language and runtime version as the production image.

### Layers

- **TEST-8: Guard tests scan the whole tree.** One test per cross-cutting rule, failing with the file and line:
  - design tokens: no raw colors, sizes or fonts outside the theme;
  - glossary: banned and renamed words do not appear in copy;
  - UI primitives: no raw buttons or inputs outside `ui/`;
  - boundaries: modules reach each other only through their public door (see [structure](structure.md)).
  Each guard has a deliberate-violation case to prove it can fail, and a baseline that only shrinks if old violations exist.
- **TEST-9: Unit tests cover pure logic;** integration tests cover a module with its real database and faked externals; contract tests pin shapes that other parties rely on (API schemas, MCP tool names, webhook payloads).
- **TEST-10: End-to-end tests run against a production build,** not the dev server, with an isolated database and isolated data per run.
  - Email goes to a mail harness the test can read, so magic links and receipts are tested for real.
  - Hardware and third parties are faked at the provider layer.
  - Each user journey in the requirements maps to at least one e2e test.
- **TEST-11: Smoke-test the real production image** against a real database under production restrictions: migration twice, runtime role without DDL rights, readiness failing then recovering, build id reported. A fresh seeded database proves nothing about production data.
- **TEST-12: A migration that can refuse production data ships a read-only preflight** and a test that asserts the specific refusal.

### Process

- **TEST-13: For a bug, the failing test comes first.** Reproduce, write the test, see it fail for the reported reason, then fix.
- **TEST-14: Each rule has an acceptance scenario.** The Given / When / Then in `docs/rules.md` maps to a test, and the test name carries the rule id (see [decisions](decisions.md)).
- **TEST-15: A changed UI control is verified only once seen in the running app.** Open it, use it with the keyboard and the mouse, at 150 percent zoom, and in each state (empty, loading, error). Passing tests alone do not close a UI change.
- **TEST-16: Sweep, never spot-fix.** When a finding names one site of a rule, search the whole tree for the pattern, fix every site, and add or extend a guard test.
- **TEST-17: List callers before changing shared code.** Before changing a shared component or function, list its callers and the e2e locators that depend on its role and words.
- **TEST-18: Never game a check.** No sleep, wrapper or special case added only to make a test pass. Fix the cause. Tests for hooks and CI scripts exist too.

- **TEST-19: Every gate and hook has negative fixtures.** Forbidden edits, stale locks, missing evidence and below-floor classes must fail; permitted paths must pass. A gate tested only on the happy path is not known to block anything.
- **TEST-20: Agent tooling is tested in layers.** Structure and contract (files, frontmatter, declared tools), trigger discrimination (the right prompts activate it, near misses do not), and a few end-to-end runs in a sandbox. Skipped layers are reported, not hidden (TEST-6).

## How to apply

1. Create the layers in this order: unit and guard tests, integration with real Postgres, then e2e on a production build with the mail harness.
2. Add a network guard in the shared test setup before any test is written (TEST-4).
3. Add the four guard tests (tokens, glossary, UI primitives, boundaries) as soon as the first file they scan exists, so there is no backlog of violations.
4. Put every layer in the single verify command and the required CI job (see [ci](ci.md)).
5. When adding a rule, write the scenario and the test in the same PR. When fixing a bug, follow TEST-13.

## Checks

- Automatic: all layers run in CI; the guard tests are in the required job; a test run with the network blocked still passes; coverage does not shrink without a note.
- Review: whether a new test would fail without the change, whether a UI change was seen running, whether e2e covers the journey the requirements name.

## Mistakes to avoid

- Guard tests that existed but ran outside the required CI job, so nothing enforced them.
- A typecheck that did not cover the language the source was written in.
- Mocking the database and missing a migration failure that production hit.
- A source-text test mistaken for a behavior test; the behavior broke and it still passed.
- Spot-fixing one site and leaving the same defect in ten others.
- A fresh seeded database used to claim a migration was safe.
- A hook that blocked nothing in practice, because only the allowed case was ever tested.
- Fixed sleeps added to quiet a flaky test, which later hid a real race.
