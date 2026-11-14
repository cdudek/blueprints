# Blueprints

Documents an AI agent follows to set up and grow a new product: how things are structured, which defaults apply, and why. Point an agent at a blueprint and say "create a project from this". The blueprints describe; they never implement, so they do not go stale with the next framework release.

## Available blueprints

| Blueprint | What it is |
| --- | --- |
| [`core/`](./core) | Stack-agnostic. Start with [`core/BLUEPRINT.md`](./core/BLUEPRINT.md); it links to one reference per topic. |
| [`nextjs/BLUEPRINT.md`](./nextjs/BLUEPRINT.md) | The default stack: a modular monolith on Next.js App Router, TypeScript and Postgres. Read after core; adds framework boundaries, UI, providers, checks and container delivery. |
| [`fastapi/BLUEPRINT.md`](./fastapi/BLUEPRINT.md) | Python-specific additions to core: FastAPI, async SQLAlchemy, Postgres and durable workers. Entry doc plus topic references. |

## How to use a blueprint

1. Tell the agent to read `core/BLUEPRINT.md` and the stack blueprint, then follow the build order.
2. The agent opens each reference when it reaches that step, applies its rules and sets up its checks.
3. For an existing product, the agent reads the reference for the area it changes and follows its "How to apply".

## Conventions in this repository

- Docs only: prose, annotated folder trees and short pseudocode. No runnable code, configs, tests or CI for applications.
- Version-agnostic: libraries are named, versions are not. Agents use the latest stable version at build time.
- Every reference has `read-when` and `skip-when` frontmatter and rules with stable IDs, so products, reviews and tests can cite them.
- The layout mirrors a Claude Code skill (entry file plus `references/`), so a blueprint can become a plugin later.

## How CI works in repos that use these blueprints

- **Pushes:** Pushes are never gated. There is no pre-push hook.
- **Actions:** GitHub Actions runs `ci` once per ready pull request. Draft PRs cost nothing, and nothing runs on push to the default branch.
- **Required check:** `ci` is the only required check. It runs `scripts/ci-local --ci`.
- **Local-only checks:** Heavy checks (e2e, docker, macOS builds) are `LOCAL_ONLY_CHECKS`. Actions skips them; run them with `scripts/ci-local`.
- **Runner behaviour:** `scripts/ci-local` stops at the first failure (`--keep-going` runs all), prints the last 80 lines of a failing check's log, runs the cheapest checks first from recorded durations, deletes `CI_LOCAL_CLEAN_PATHS` before starting, and serialises `HEAVY_CHECKS` through a machine-wide lock.
- **Decision4:** Decision4 is a section of the PR body only, advisory. No job, workflow or check runs it, and the `ci.yml` template does not call it.
- **Review:** There is no AI review in the gate.
- **Dependabot:** Dependabot runs weekly, with one grouped PR per ecosystem and a cooldown.

Templates: [`ci-local.sh`](./core/references/ci-local.sh), [`ci.yml`](./core/references/ci.yml) and [`dependabot.yml`](./core/references/dependabot.yml). The rules and the migration checklist are in [`core/references/ci.md`](./core/references/ci.md).
