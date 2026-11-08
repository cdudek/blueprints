---
name: fastapi
description: The Python and FastAPI additions to core for an API or worker built as a modular monolith
read-when: creating a Python API or worker, adopting this blueprint in an existing service, or changing its stack conventions
skip-when: the product does not use Python or FastAPI
---

# FastAPI blueprint

Use this for a product that needs Python: an HTTP API, a worker, or both. FastAPI is the delivery layer; Postgres, async SQLAlchemy with psycopg and Alembic handle data. Pydantic parses inputs, and a separate worker handles durable background work. Start as a modular monolith.

Read [core](../core/BLUEPRINT.md) first. It owns the product briefing, build order, access policies, compatibility, secrets, Decision4 and quality ratchets. These references add the Python choices and checks. They describe what an agent builds in the product repository; this blueprint contains no runnable application. Use the latest stable versions at build time, read the tools' current documentation and pin the resolved versions in the product.

## How an AI applies it

1. Follow core's build order, including PRODUCT.md, agent files and the first required checks. Pick FastAPI because the product needs Python, not because a template happens to exist.
2. Read [project layout](references/project-layout.md), then [architecture checks](references/architecture-checks.md) and [quality gates](references/quality-gates.md) before the first feature. Create a flat `src/` layout and one `architecture.yaml` in the product. Start its baseline empty.
3. Read [settings and logging](references/settings-and-logging.md), [database and migrations](references/database-and-migrations.md) and [clients](references/clients.md) when wiring infrastructure. Build fake providers before real integrations.
4. Read [API layer](references/api-layer.md) for routes and contracts, and [background jobs](references/background-jobs.md) when the first durable task appears. Keep delivery, operations and pure decisions separate.
5. Read [testing](references/testing.md) alongside each feature, then [deploy](references/deploy.md) before shipping. Build the product's checks and runbooks as part of that work.

For an existing service, open the reference for the area changing, follow its "How to apply", and adopt checks with core's ratchet. Do not copy an application or import a second policy. Record product-specific exceptions in its ADRs.

## Rules

- **FAPI-1 Core stays the common contract.** Follow the linked core rule where no Python addition is given. In particular, service operations own transactions (STR-13, DAT-6), workflows sequence atomic operations without opening transactions (STR-15), and expected failures are typed results (STR-8). Python exceptions carry unexpected failures. A framework convention does not change these boundaries.
- **FAPI-2 Source lives directly under `src/`.** The import roots are `api`, `modules`, `domain`, `clients`, `config`, `db` and `shared`; there is no enclosing `app/` package. The [layout reference](references/project-layout.md) explains packaging and checks.

## Checks

Automatic in the product: the checks named in each reference run through core's [Make and CI contract](../core/references/ci.md). Review: the stack fits the product and every exception is recorded. This repository's documentation cannot prove a consuming product has implemented its rules.
