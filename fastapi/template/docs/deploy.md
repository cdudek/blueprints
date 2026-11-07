# Deploying: expand, roll out, contract

One image build gives three targets (`make docker-build`): `web`, `worker` and `migrate`. Build
once per commit and promote the same digests through every environment.

## The sequence

1. **Expand.** The `migrate` job runs `alembic upgrade head`. Only additive migrations
   (`PHASE = "expand"`) run here; `tests/architecture/test_migrations.py` refuses a drop, a rename,
   a `NOT NULL` tightening or a type change in one. The pipeline then checks the exact state with
   `alembic current --check-heads`.
2. **Roll out next to the old version.** Deploy the new web and worker revisions. Old and new run
   against the expanded schema at the same time.
3. **Shift traffic** to the new web revision.
4. **Stop the old web and worker revisions.** Workers shut down gracefully; a job whose worker
   died mid-run is retried by the stalled-job task once the worker stops heartbeating
   (`docs/worked-slice.md`).
5. **Wait out the rollback window.** A rollback shifts traffic back to the old revision, which
   still works because only expand ran.
6. **Contract in a later release**, once no running version uses the object. The contract
   migration sets `PHASE = "contract"` and `LAST_USE_REMOVED_IN = "<release>"`, the release that
   removed the last use; the pull request names it too.

**Jobs across versions.** Job payloads change only additively: a new argument has a default. A
renamed task keeps its old name registered until no old worker is running.

## Probes

- `/healthz` checks the process only. Use it as the liveness probe.
- `/readyz` checks that the database answers and that the migration this code needs
  (`REQUIRED_REVISION` in `src/app/db/schema_history.py`) is recorded in `schema_history`. Use it
  as the startup and readiness probe.

Readiness asks for compatibility, not the exact head. After step 1 the database is ahead of the
old instances, and they stay ready because their required revision is still applied. A new
instance started before its migration is not ready. `env.py` records every applied revision in
`schema_history` through Alembic's `on_version_apply` hook. Raise `REQUIRED_REVISION` in the
change whose code starts using a new revision; never lower it.

Probes are public, are left out of access logs and are never traced.

## Runtime

- **One process per container.** `web` runs one uvicorn process with `--proxy-headers`; scale with
  instances. `worker` is its own service with CPU always allocated, never inside the web process.
- **Database, keyless.** Each runtime connects as its own service identity with Cloud SQL IAM
  database authentication, through the Cloud SQL Auth Proxy running as a sidecar with
  `--auto-iam-authn`. The app sees a local Postgres and a URL without a password, for example
  `postgresql+psycopg://<identity>@127.0.0.1:5432/<db>`; the instance needs the
  `cloudsql.iam_authentication` flag. The SQLAlchemy engine, the job queue's pool and Alembic all
  use that one URL. The Cloud SQL Python connector is not used: its psycopg support is synchronous
  only, and the async engine and the queue pool both need async psycopg connections.
- **Secrets** are mounted as files under `/run/secrets` and win over environment variables. Only
  the worker reads `PAYMENTS_API_KEY`; it builds the payments provider at startup, so a missing
  key stops it there. Production refuses fixture and noop providers. Declaring, setting and
  rotating secrets follows `tools/common/README.md`.
- **Logs** are JSON lines with `request_id`, and `trace_id` and `span_id` inside a traced request.
  Values under sensitive keys and every `SecretStr` are masked.
- **Tracing** is on only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## CI

`.github/workflows/ci.yml` runs `make check` against a Postgres service container with no cloud
credentials, then builds the three images and smoke-tests them: `migrate` against an empty
database, `web` until `/readyz` answers, and the worker's health checks.
