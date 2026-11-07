# Blueprints

Architecture blueprints for building applications, each with a runnable template that enforces its
own rules. This repository is the only home of these blueprints; copies elsewhere are not
maintained.

## Available blueprints

| Blueprint             | What it is                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`nextjs/`](./nextjs) | A modular monolith for Next.js App Router with TypeScript, Postgres and drizzle (Prisma works the same way). |
| [`fastapi/`](./fastapi) | A modular monolith for FastAPI with Python 3.14, Postgres (async SQLAlchemy, Alembic) and a Procrastinate worker. |
| [`common/`](./common) | Shared parts, not a blueprint: the secrets CLI, Terraform module, Make contract and naming every blueprint vendors. |

## How to start from a blueprint

1. Read the blueprint's `ARCHITECTURE.md`. It states the rules, why they exist, and what is checked by
   a tool and what is left to review.
2. Copy the template folder into a new repository and run its `check` script. A fresh copy passes
   everything.
3. Replace the example modules with your own. Every rule keeps failing the build on violations from
   the first commit.
4. For an existing application, follow the brownfield section of the blueprint's `README.md`:
   freeze today's violations as a baseline that can only shrink.

## Conventions in this repository

- A blueprint is a document plus a template. The document is the single source of truth for the rules;
  the template carries each rule as working code and a deliberate-violation test.
- Templates pin their tool versions and carry their own changelog. Upgrade by copying the new scripts
  and following the changelog.
- Nothing here is specific to a company, product, or cloud account or project. `common/` targets GCP
  in 1.0.0 behind a backend seam, with no account, project or organisation ids.
