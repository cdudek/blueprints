---
name: release-and-deploy
description: How a product is versioned, built into an image, deployed, verified and rolled back, with GCP Cloud Run as the default target and the recipe for a later own Kubernetes cluster.
read-when: Setting up CI/CD or infrastructure, writing a Dockerfile, adding a health endpoint, changing how a release reaches production, or preparing the move to Kubernetes.
skip-when: Pure feature work that touches no build, image, pipeline, infrastructure or health endpoint.
---

# Release and deploy

A release is one commit built once into one immutable image and promoted through environments by CI. The product is container-first and portable: one image, config from env, health endpoints, migrations as a separate job. Today it runs on GCP Cloud Run; later it may move to the owner's own Kubernetes cluster, and the rules below keep that move cheap.

## Rules

### Versioning and build identity

- **REL-1. The version lives only in the git tag.** semantic-release derives it from Conventional Commit titles on squash-merge. No version field in package files is edited by hand or trusted. The image tag is the commit SHA, never a mutable tag; the semantic version is a label next to it.
- **REL-2. Every build shows its version and commit.** The UI footer or about page and every log line carry both. Set at build time from the tag and SHA, read from env at runtime. A bug report without them is incomplete.
- **REL-3. One squash-merge per change, Conventional Commit title.** The title drives the version bump and the release notes. The product changelog entry is authored separately (CPY-20). A breaking change is marked as such in the title and needs the answer from [compatibility](compatibility.md).

### Container image

- **REL-4. Multi-stage, minimal, non-root, read-only.** Build in one stage, copy only the runtime output to a small final stage. Numeric non-root user, read-only root filesystem, explicit writable scratch directory, no shell tools the app does not need.
- **REL-5. Base images are pinned by digest.** A tag like `slim` moves under you. Dependabot or equivalent updates the digest by PR. Build context excludes env files, keys and worktrees.
- **REL-6. Scan and describe every image.** CI scans for known vulnerabilities and produces an SBOM. A critical finding with a fix available fails the build.
- **REL-7. One immutable image runs the app and the migrations.** Built once per revision and tagged with the SHA. The migration job is a separate command run from that same image, never a second image. A migration that does not match the app code is a deploy bug.

### Health

- **REL-8. `/healthz` has no dependencies.** It answers 200 if the process can serve. It never touches the database or any client. Liveness probes use it. Uptime monitoring and deploy gates use `/readyz` (REL-9).
- **REL-9. `/readyz` fails closed and returns the build SHA.** It checks required dependencies (database reachable, schema compatible with this code) with a short timeout, returns non-200 on any doubt, and returns the running SHA uncached. Both endpoints sit outside auth and outside locale routing.

### Default target: GCP

- **REL-10. Cloud Run, Cloud SQL Postgres, Terraform.** EU region (see [security](security.md) and [legal](legal.md)). One service per deployable app. Secrets come from Secret Manager ([env-and-secrets](env-and-secrets.md)). No Cloud Run-only feature leaks into app code.
- **REL-11. CI authenticates keyless.** GitHub Actions federates to GCP through workload identity. No service account keys in repo, secrets or env. One deployer identity per app with only the roles it needs; the runtime identity is separate and has no DDL rights.
- **REL-12. Promotion is staging, then no-traffic revision, then health gate, then production.** Deploy the new revision to production with zero traffic, call `/readyz` on its own URL, check the SHA matches, then shift traffic. A failed gate leaves the old revision serving.
- **REL-13. Rollback is automatic and cheap.** If post-deploy checks fail, traffic returns to the previous revision without a human. The previous revision keeps working because migrations are backwards compatible (expand, migrate, contract).
- **REL-14. A preview per PR, isolated.** Own hostname, own database, own secrets, own identity. A preview never inherits production config, secrets or jobs. Do not offer previews until this holds. Previews are deleted when the PR closes.
- **REL-15. Migrations run as a separate job before traffic shifts.** Never at server startup. The job uses its own identity with DDL rights; the runtime has DML only. See [data-and-migrations](data-and-migrations.md).

### Infrastructure as code

- **REL-16. Infrastructure is code, applied only by CI after merge.** PRs run plan read-only. Merge applies the saved plan. Applies are serialized. Nobody applies from a laptop. An emergency manual change is imported back into the code the same day.
- **REL-19. Paid automatic registry scanning stays off unless the owner explicitly opts in.** Keep `containerscanning.googleapis.com` out of the default enabled-API list. Every GCP Artifact Registry Docker repository, including staging and previews, explicitly sets `vulnerability_scanning_config.enablement_config = "DISABLED"`. An agent, bootstrap script or dependency must not enable paid scanning as incidental setup. Before enabling it, record owner approval, affected projects/repositories, current pricing, expected monthly image volume and cost, and how to stop it. Keep the CI image scan and SBOM required by REL-6; record any missing coverage rather than claiming it exists.
- **REL-17. Drift is checked on a schedule.** A scheduled plan fails loudly when reality differs from code. Stateful resources (database, buckets) have deletion protection, backups and point-in-time recovery. A backup counts only after a restore has been tested.

### Done means verified

- **REL-18. A deploy is done only when production serves the expected SHA.** After the traffic shift, poll the public URL's `/readyz` until it returns the commit just built, repeatedly, and wait for the post-deploy checks to finish. Record the deployment only after that.

## GCP scanning defaults and costs

The project must first enable the Container Scanning API. Once enabled, Google automatically
scans newly pushed images in standard and remote Docker repositories unless a repository
explicitly disables scanning. Enabling Artifact Registry for image storage alone is not the
same as enabling the paid scanner. Disabling the API stops project-wide scanning; explicit
repository exclusions survive API re-enablement. See [Google’s documented defaults](https://docs.cloud.google.com/artifact-analysis/docs/enable-automatic-scanning).

The service charges per initial image scan; repeated builds can therefore accumulate charges.
Check [current pricing](https://cloud.google.com/artifact-analysis/pricing) before requesting an
exception to REL-19. Cloud Build allowances do not make this separate scanning service free.
Budget alerts are notifications, not a hard spending cap, and stopping scans does not cancel
charges already incurred or still being reported.

## How to apply

1. Add semantic-release, the SHA and version build args, and the UI and log display of both.
2. Write the Dockerfile to REL-4 and REL-5. Define the migration job as a separate command of the same image.
3. Add `/healthz` and `/readyz` before the first deploy. Test that `/readyz` fails when the database is down.
4. Define infrastructure in Terraform: network, Cloud SQL, Secret Manager containers, Cloud Run services, deployer and runtime identities, workload identity binding to the repo.
5. Build the pipeline: PR (checks, plan, preview), merge to main (build, scan, push, apply, deploy to staging, gate, production no-traffic, gate, shift, verify SHA).
6. Document the restore drill and the rollback command in the repo README, then run both once.

Sketch of the production job order:

```
build image (SHA tag) -> scan + SBOM -> push
run migration job (new image)
deploy revision, 0% traffic -> GET revision-url/readyz == SHA ?
shift 100% -> GET public-url/readyz == SHA (repeat) ?
no -> shift back to previous revision, fail the run
```

When changing the pipeline later, keep the gate order. A shortcut that skips the no-traffic step needs an owner decision.

## Later: own Kubernetes cluster

The move is a recipe, not a rewrite, because the app already depends only on env, a container and two endpoints.

- **GitOps repo.** A separate repo holds the desired state per environment. CI builds the image, then opens a PR that bumps the image SHA in the production overlay. Serialize the bumps, reject stale ones, close superseded ones.
- **Blue-green with analysis.** The new revision starts with no traffic. A smoke analysis runs against its preview service, then traffic switches, then a bounded analysis runs while the old revision stays available for rollback. Queries are scoped to this app, a missing metric is "no data" and not zero, a single failed query does not pass, and the window is longer than log ingestion lag.
- **Secrets.** External Secrets maps Secret Manager entries to Kubernetes secrets from an allowlist (each entry has an owner; CI rejects undeclared and stale ones). Sync is not rotation: environment variables are fixed at pod creation, so add a reloader that restarts pods when a secret changes.
- **Migrations.** A job that runs before the rollout, under its own identity, in an ordinary sync wave. The previous revision must still work after a rollback.
- **Per routed service:** a WAF policy, a health check pointing at `/readyz`, and access logs. Preview services get the same.
- **Availability.** At least two replicas spread over nodes, an autoscaler the GitOps tool does not reset, a disruption budget that selects serving pods only, graceful drain on shutdown.

What to avoid now so the move is cheap: Cloud Run-only SDK calls in app code, config read from files instead of env, migrations at startup, secrets fetched by the app from a cloud API at runtime, and any state on local disk.

## Checks

Automated: image scan and SBOM on every build; digest pins present; no root user in the final stage; Terraform plan on PR and drift job on schedule; `/readyz` SHA equals the built SHA after deploy; no service account key in the repo.

Review: REL-19 API exclusion and explicit repository scanning disablement, or a recorded owner-approved exception with pricing and volume; gate order unchanged, preview isolation (own database and secrets), rollback tested at least once, restore drill dated.

## Mistakes to avoid

- Docs that still say canary, startup migrations or an old target while the pipeline does something else.
- Calling a deploy done when three readiness checks pass but the post-deploy analysis can still roll it back.
- Rollout analysis that queries the whole namespace or load balancer and treats an empty series as zero.
- Previews that inherit the production hostname, secrets, identity or scheduled jobs.
- Mutable base image tags and unpinned CI actions.
- Describing secret sync as rotation, so a rotated key never reaches running pods.
- Raising job deadlines to hide slow infrastructure.
- Backups described as disaster recovery without a tested restore.
