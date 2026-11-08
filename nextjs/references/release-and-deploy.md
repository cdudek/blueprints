---
name: nextjs-release-and-deploy
description: Standalone Next.js containers, Cloud Run and Cloud SQL, preview isolation and multi-instance coordination
read-when: building the image, wiring deploys or previews, changing runtime config, or scaling beyond one instance
skip-when: changing application behavior without a runtime, config or release effect
---

# Release and deploy

Apply [core release and deploy](../../core/references/release-and-deploy.md), [env and secrets](../../core/references/env-and-secrets.md) and [observability](../../core/references/observability.md). Start with Cloud Run and Cloud SQL Postgres. The application remains a portable Node container with Postgres; platform setup belongs to the product's infrastructure, not this documentation repository.

## Rules

- **NEXT-DEPLOY-1 Build a standalone production artifact.** Use Next.js standalone output, copy the traced server plus required static and public assets into a minimal non-root image, and run the standalone server on the platform's port and interface. Check tracing for workspace packages and runtime assets. Build once per commit and promote the same digest; do not rebuild per replica. See the current [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting).
- **NEXT-DEPLOY-2 Separate build-time and runtime configuration.** `NEXT_PUBLIC_*` is browser-visible and built into the output. A value that must change on image promotion stays server runtime config and is exposed only through an intentional safe projection when the browser needs it. Keep secrets out of image layers and public bundles. The one env reader validates required deployment config, including canonical origin and provider modes, without requiring a database connection during compilation.
- **NEXT-DEPLOY-3 Cloud Run and Cloud SQL are the first host.** Use a dedicated workload identity, least-privilege SQL access and the platform-supported secure connection method. Set pool limits together with container concurrency and maximum instances; scaling cannot exceed the SQL connection budget. Run migrations as a single controlled job before traffic moves, following [data and migrations](data-and-migrations.md). The web runtime has no DDL rights.
- **NEXT-DEPLOY-4 Multiple replicas share a release contract.** All instances of a revision use the same build output and deployment identifier. Manage `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` through the build secret mechanism when the deployment needs a consistent key, following the installed framework's rules; a runtime-only setting does not rewrite a compiled artifact. Configure deployment skew handling for rolling revisions. Shared caches and tag invalidation require cross-instance coordination or an explicit uncached design; local ephemeral disk is not shared state.
- **NEXT-DEPLOY-5 Prove request and shutdown behavior.** Expose cheap liveness, dependency-aware readiness and build identity through thin routes. Readiness checks schema compatibility without running migrations. Forward SIGTERM, drain in-flight work within the platform grace period, and prove streaming survives the ingress without buffering. Framework post-response hooks are not durable workers. Run a worker from the same codebase as a separately managed process or use authenticated scheduled job entry points with persisted work.
- **NEXT-DEPLOY-6 Previews are isolated releases.** Give each PR its own revision, database or isolated schema and least-privilege credentials, synthetic data, callback origin and mail harness. Never clone live customer data by default or reuse production provider keys. Gate preview access and apply noindex; noindex alone is not access control. Verify the actual deployed build identity before Playwright and Lighthouse run. Cancel superseded work and make cleanup idempotent on close, including abandoned-preview expiry.
- **NEXT-DEPLOY-7 Portability includes operations.** Keep uploads and durable state out of the container filesystem. Place provider-specific connection and identity details at configuration or client boundaries. A move to another container host changes deployment plumbing, not services or repositories. Document how database restore, compatible image rollback, scheduled work and preview cleanup operate on that host.

## How to apply

Build and smoke the final image locally with real Postgres. Add health routes and migration delivery, then staging, the preview lifecycle and production traffic promotion. Use core's keyless CI and infrastructure-as-code process in the product repository. Connect logs and traces through the framework instrumentation entry point, with redaction and release identity.

Changing later: smoke old and new revisions against the expanded schema, test an action across a rolling deployment, and test cache invalidation on two replicas. A compatible image rollback does not undo a destructive migration; follow core's put-right plan.

## Checks

- Automatic: final image serves static assets and health routes as non-root, reports the expected build, handles termination, and uses runtime credentials without DDL rights.
- Automatic: production refuses fake providers; previews cannot reach production data or send live mail; closed and expired previews lose their resources; tests verify the preview revision is current.
- Automatic: where used, two-replica tests cover cache invalidation and action key or deployment skew behavior. Migration smoke and pool/concurrency limits feed release checks.
- Review: IAM scope, restore evidence, capacity, ingress behavior and portability of platform assumptions.

## Mistakes to avoid

- A standalone image missing `.next/static` or public assets.
- Rebuilding one image per environment while calling it promotion.
- A preview cleanup that deletes shared resources or silently leaves databases behind.
