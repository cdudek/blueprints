---
type: plan
status: in-progress
created: 2026-11-23
author: Calvin Dudek (with Claude)
project: blueprints
supersedes: none
---

# CI: one job per stage, one named step per check

Owner ask (2026-11-23): every check runs as its own GitHub Actions step with a meaningful name (like ramp106/reviews-projects-marketplace), and the stages run as parallel jobs (static, unit, build + e2e-smoke, extras). Today `static` is one step running 14 checks.

## Decisions

- Runner `ci-local.sh` gains `--check <name>`. Unknown name exits non-zero; with `--ci` a LOCAL_ONLY name is refused; same setup as `--stage` (base tree, tools, clean paths, no receipt).
- Workflow: four parallel jobs; each check one step, `name:` a human label, `run:` the check id, `if: ${{ !cancelled() }}`. e2e-smoke after build in one job. `ci` keeps its name, needs all four, draft still fails.
- Drift guard: a policy test fails unless the workflow's `--check` steps equal CHECK_NAMES minus LOCAL_ONLY_CHECKS, each in the job of its CHECK_STAGES.
- Every job that runs database tests gets the Postgres service and TEST_DATABASE_URL, so no suite skips silently.

## Steps

- [ ] Blueprints: runner `--check`, template ci.yml, ci.md (CI-43), drift guard, tests; PR, merge.
- [ ] Roll out, pinned to the merged blueprint commit: heapthat, heydiff-chrome, heydiff-kit, heydiff-web, samplewerk-app (stage steps today); heydiff-context, samplewerk-context, samplewerk-web (one `--ci` step today); terraform-infra (check whether it runs the runner in CI).
- [ ] Per repo: the first CI run shows the four jobs, one readable step per check, and the same test and skip counts as before.
