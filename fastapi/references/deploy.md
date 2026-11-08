---
name: fastapi-deploy
description: Container roles, Cloud Run and Cloud SQL deployment, and a portable runtime boundary
read-when: building Python images, deploying web or worker processes or changing hosting
skip-when: the change touches no runtime or deployment behavior
---

# Deploy

Apply core [release and deploy](../../core/references/release-and-deploy.md), [env and secrets](../../core/references/env-and-secrets.md) and [observability](../../core/references/observability.md). The current hosting choice is Cloud Run with Cloud SQL for Postgres. Containers, standard Postgres and provider interfaces preserve the path to another host.

## Rules

- **FDEP-1 Build container roles from one resolved dependency set.** Use a reproducible Python/uv multi-stage build with a dependency-cache layer, locked installs and no dev dependencies in runtime stages. Run as non-root, use exec-form entry points and promote the same built digests through environments. `web`, `worker` and `migrate` are separate commands/targets from that build, not three applications with independent dependencies.
- **FDEP-2 Web runs one Uvicorn process per container.** Bind the platform port on all interfaces and let the platform scale replicas. Configure trusted proxy handling deliberately. Manage engines and clients through FastAPI lifespan, handle termination gracefully and leave no durable state on the local filesystem. Migration never runs at web startup.
- **FDEP-3 Cloud SQL access is an infrastructure detail.** Prefer IAM database authentication through the Cloud SQL Auth Proxy where supported for the selected async driver and runtime. The proxy establishes transport/authentication; the app still uses the ordinary SQLAlchemy psycopg connection. Keep proxy/connection settings in configuration, separate app DML and migration DDL identities, and budget pools against maximum web plus worker instances. Do not introduce a synchronous connector into the async path without verifying support.
- **FDEP-4 A polling worker needs a runtime that keeps running without HTTP traffic.** Use a [Cloud Run worker pool](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run) or another explicitly provisioned always-running worker host. If using a Cloud Run service for polling, verify its HTTP serving contract, instance-based CPU allocation, minimum instances and scaling behavior; CPU outside requests alone does not guarantee it stays alive or scales from zero. Queue depth/age and missing heartbeat drive alerts and any scaling policy. A Cloud Run Job suits finite migration/backfill work, not an unbounded poller. Check the current [Cloud Run scaling contract](https://docs.cloud.google.com/run/docs/about-instance-autoscaling).
- **FDEP-5 The release owns schema compatibility and worker overlap.** Execute the separate migration job, verify intended heads, deploy web and worker next to compatible old revisions, check readiness, shift traffic and retire old consumers. Contract only in the later release after the rollback window and old job payloads are drained (FDB-5, FJOB-6). Keep a runbook for failed migrations, worker drain, reconciliation and rollback to the prior image without a schema downgrade.
- **FDEP-6 Keep hosting APIs out of modules.** Modules know records, operations, Postgres and client interfaces. Cloud identity, secret mounts, proxy lifecycle, service scaling and deployment manifests stay in infrastructure/composition configuration. A host move changes these adapters and runbooks, not pricing rules or the payment state machine.

## How to apply

```text
one build -> web image/command     -> Cloud Run HTTP service
          -> worker image/command  -> worker pool or provisioned polling runtime
          -> migrate image/command -> finite job with DDL identity
all data  -> ordinary Postgres connection -> Cloud SQL now, another Postgres host later
```

Read the [API probe contract](api-layer.md), [migration sequence](database-and-migrations.md) and [worker lifecycle](background-jobs.md) when writing the product's deployment runbook. Before the first release, smoke-test the actual runtime images against disposable Postgres under deployed restrictions. For a host change, prove the same images' startup, termination, probes and worker recovery on the new runtime before moving traffic.

## Checks

Automatic: runtime images install from the lock, start as non-root, migrate and verify schema, serve readiness and report their build; app identity lacks DDL rights. Test missing credentials at startup, DB unavailable/recovered, graceful worker shutdown and re-delivery after a killed worker. Review: Cloud Run CPU/instance settings and current worker-pool availability, IAM/region/network configuration, Cloud SQL connection capacity and rollback evidence. Container portability does not make these operational choices automatic.
