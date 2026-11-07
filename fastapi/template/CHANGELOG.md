# Changelog

The blueprint, its policy schema (`architecture.schema.json`) and its scripts (`scripts/arch`,
`scripts/quality`) are versioned together, so a service adopts a known release.
`architecture.toml` carries `schema_version`; the scripts refuse a version they do not know.

- Major: the policy file or a gate changes in a way existing services must migrate to.
- Minor: a new rule or option; existing policy files keep working, new findings may appear.
- Patch: fixes that do not change what a correct service is told.

## 1.0.0

First release.

### Architecture

- Modules behind doors (`__init__.py`), with `router.py`, `system.py` and `jobs.py` role doors
  where a module needs them; operations as plain functions taking `tx` and the caller.
- One owner per transaction (`in_transaction()`), with nesting refused; jobs deferred in the
  caller's transaction.
- The worked slice: an order, a durable payment request, a worker that charges once with a fixed
  idempotency key, stalled-job recovery and a sweeper.
- Readiness by schema compatibility (`REQUIRED_REVISION` in `schema_history`); expand and
  contract migrations marked with `PHASE`.

### Checks

- `architecture.toml` (`schema_version = 1`) generating `.importlinter`: layers, door and
  role-door protection, rules purity, a framework-free core.
- Architecture tests: transaction owner, sessions in `db/`, no external call in a transaction,
  pure rules, door shape and exports, table owners, authenticated routes, additive expand
  migrations; each with a violating fixture, a clean twin and an exact message.
- Ratchets against the merge base: suppressions, baselines and policy changes, with
  `quality/policy-log.toml` for accepted loosenings.
- deptry, the OpenAPI snapshot, `alembic check`, gitleaks 8.30.1 on staged changes and history.

### Runtime

- Settings that prefer mounted secret files over environment variables; production refuses
  fixture and noop providers.
- structlog JSON logs with request IDs and masked secrets; OpenTelemetry tracing when an endpoint
  is set; probes neither traced nor logged.
- One Dockerfile with `web`, `worker` and `migrate` targets; CI that runs `make check` and
  smoke-tests the images without cloud credentials.
- common 1.0.0 vendored as `tools/common/`: secrets CLI, Make contract, agent rules.
