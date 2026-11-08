---
name: fastapi-testing
description: Pytest layers, async fixtures, real Postgres isolation and provider and HTTP contracts
read-when: setting up Python tests, adding a behavior or regression test, or changing test infrastructure
skip-when: the change touches no application behavior or test convention
---

# Testing

Core [testing](../../core/references/testing.md) owns the test strategy, network guard, negative fixtures and production-image checks. Use pytest for the Python layers below.

## Rules

- **FTEST-1 Run against installed source with strict collection.** Use pytest's importlib import mode, strict config and marker checking, and warnings as errors with narrow documented exceptions. Pick one async backend, normally asyncio through AnyIO, and give async fixtures compatible loop and resource lifetimes. Test helpers do not mutate import paths.
- **FTEST-2 Fixtures expose real seams.** Construct principals, settings, providers and explicit clocks as inputs. Use a fresh scripted provider per test and reset any process-scoped caches or overrides during teardown. FastAPI dependency overrides belong only at the HTTP boundary and are always cleared. Do not patch module internals or replace repositories (CQ-7).
- **FTEST-3 Migrate an isolated Postgres before database tests.** A migrated database may be cloned per test module or worker, then dropped after all pools close. Repository tests can roll back a transaction per case. Worker and concurrency tests must commit for real on separate connections: one connection cannot see another's uncommitted rows at Read Committed. SQLite and session mocks cannot establish these guarantees.
- **FTEST-4 Exercise ASGI startup explicitly.** Use HTTPX's ASGI transport with a lifespan manager or a fixture that runs the app's lifespan. Assert status, headers and response schema, including problem media type and request id. For unexpected-error tests, configure the transport to return the server response rather than only re-raising the exception; assert the diagnostic separately.
- **FTEST-5 Keep HTTP, job and provider contracts distinct.** Compare generated OpenAPI with the committed contract, test previously published request/response and webhook fixtures, and deserialize old queued payloads with new workers. Shared client contract scenarios exercise fixture semantics and the real provider with a fake transport; they do not contact a live vendor. Optional read-only drift probes are separate from the credential-free required suite.
- **FTEST-6 Block accidental outbound network while permitting explicit test infrastructure.** Use pytest-socket or an equivalent guard with narrowly allowed disposable Postgres endpoints or local sockets. Test the guard with a forbidden target. Real-provider tests use in-process HTTPX transports, and the required suite needs no vendor credentials. Do not allow all loopback ports merely because the test database is local.

## How to apply

```text
tests/
  unit/                  domain and module rules; no I/O or mocks
  integration/           operations, repositories, migrations, workers; real Postgres
  contract/              HTTP schemas, webhook and job payload compatibility, providers
  architecture/          import, AST, metadata and route-discovery checks
  fixtures/arch/         bad examples and clean twins consumed by architecture tests
  tooling/               policy and ratchet tests in disposable git repos
```

Write the rule's behavior test with the feature. For payment processing, pair independent-connection races with the scripted failure/crash provider from [clients](clients.md) and the lifecycle in [background jobs](background-jobs.md). Map every assertion to an observable result: a paid order, one distinct charge, no orphaned job, or the expected refusal. Re-test only the changed contract and affected integration paths during iteration; the product's full verify command runs every required layer before merge.

## Checks

Automatic: all applicable layers collected and run; async fixtures cleaned up; no skipped DB suite presented as success; network guard proves refusal; production images smoke-tested per TEST-11. Architecture checks each run a deliberate violation and clean twin with the expected diagnostic, not merely any nonzero exit. Review: whether the fixture permits behavior the real provider rejects and whether a race actually used independent committed transactions.
