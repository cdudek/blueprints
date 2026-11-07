# FastAPI blueprint

A modular monolith for FastAPI with Python 3.14, Postgres (async SQLAlchemy 2, psycopg 3,
Alembic), a Procrastinate worker and pydantic. [`ARCHITECTURE.md`](./ARCHITECTURE.md) states the
rules, why they exist, and what is checked by a tool and what is left to review.
[`template/`](./template) is a runnable service that carries every rule as code and as a test.

It shares its principles with the Next.js blueprint, so a team running both stacks reads one set
of rules, and it vendors [`common`](../common) for secrets and the Make contract.

## Start a new service

You need [uv](https://docs.astral.sh/uv/) (it installs Python 3.14 from `.python-version`), GNU
Make, Docker or Podman with compose for the local Postgres, and
[gitleaks](https://github.com/gitleaks/gitleaks) 8.30.1 on your `PATH` for the secret scan.

```bash
cp -R fastapi/template my-service
cd my-service
git init && git add -A && git commit -m "Start from the FastAPI blueprint 1.0.0"
make setup
docker compose up -d --wait db
make check
make dev
```

`make help` lists every target. A fresh copy passes `make check`; the ratchets compare with the
remote's default branch, or with `HEAD` until there is a remote. Then replace `orders` and
`billing` with your own modules: `AGENTS.md` says where each kind of code goes, for people and
agents alike.

## What is in the template

- **Two modules behind doors.** `orders` (with a router door) and `billing` (with router, system
  and jobs doors), each with a service, repository, pure rules, schemas, models and errors.
- **The worked slice.** `POST /v1/orders` places an order and a durable payment request in one
  transaction; the worker charges the provider once, survives a crash between charging and
  recording, and retries with the same idempotency key.
  [`template/docs/worked-slice.md`](./template/docs/worked-slice.md) explains it test by test.
- **Deploys.** Three image targets (`web`, `worker`, `migrate`), expand and contract migrations,
  readiness by schema compatibility. [`template/docs/deploy.md`](./template/docs/deploy.md).
- **The checks.** `architecture.toml` generates the import contracts; `tests/architecture/` adds
  the AST and reflection rules; ratchets keep suppressions and baselines from growing; gitleaks
  scans staged changes and history. Section 9 of `ARCHITECTURE.md` lists what each one detects.

### Config files, one line each

- `pyproject.toml`: dependencies, the dev group and every tool's config.
- `architecture.toml`: the policy (layers, modules, tables, role doors, public routes).
- `.importlinter`, `architecture.schema.json`: generated from the policy by `make arch-generate`.
- `quality/arch-baseline.toml`, `quality/policy-log.toml`: the brownfield baseline and every
  accepted loosening, both empty in the template.
- `secrets.manifest.json`, `secret-versions/`: declared secrets and their pinned versions.
- `.pre-commit-config.yaml`: hooks, run by prek.
- `openapi.json`: the HTTP contract; `make openapi` rewrites it, a test fails on drift.

## Brownfield adoption

1. Copy `tools/common/`, the `Makefile`, `scripts/`, `tests/architecture/`, `architecture.toml`
   and the tool sections of `pyproject.toml` into the existing service.
2. Declare today's modules, tables and role doors in `architecture.toml` and run
   `make arch-generate`.
3. Run `make arch-baseline-write`. It records today's import violations and refuses violations
   of never-baselinable contracts (role doors, framework imports in the core), which must be
   fixed first.
4. From then on `make check` fails on any new violation, and the baseline may only shrink.

## Limitations

- Import contracts see imports, not `importlib` or string imports; AST rules see names, not
  behaviour. `ARCHITECTURE.md` section 9 lists each review item.
- The slice proves the idempotency-key path; a provider without idempotency keys needs the
  look-up-before-charge path its port describes.
- macOS ships GNU Make 3.81, which ignores `.SHELLFLAGS`; recipes still run in bash. On Windows,
  use WSL or the `uv run` commands from the Makefile.

## Versioning

The document, the template and its scripts are versioned together:
[`template/CHANGELOG.md`](./template/CHANGELOG.md). `architecture.toml` carries its own
`schema_version`, and the scripts refuse a version they do not know.
