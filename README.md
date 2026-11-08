# Blueprints

Documents an AI agent follows to set up and grow a new product: how things are structured, which defaults apply, and why. Point an agent at a blueprint and say "create a project from this". The blueprints describe; they never implement, so they do not go stale with the next framework release.

## Available blueprints

| Blueprint | What it is |
| --- | --- |
| [`core/`](./core) | Stack-agnostic. Start with [`core/BLUEPRINT.md`](./core/BLUEPRINT.md); it links to one reference per topic. |
| [`nextjs/`](./nextjs) | The default stack: a modular monolith on Next.js, TypeScript and Postgres. Being converted to docs only. |
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
