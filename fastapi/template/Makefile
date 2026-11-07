# Entry points. Every target is a thin wrapper over `uv run`; longer logic lives in scripts/.
# CI calls the same targets. The shell flags, `help` and the secret-* targets come from the
# vendored common contract (tools/common/make).

include tools/common/make/common.mk tools/common/make/secrets.mk

DEV_CMD := uv run fastapi dev src/app/main.py
GITLEAKS_VERSION := 8.30.1
COMPOSE ?= docker compose
DOCKER ?= docker
IMAGE ?= app
name ?=
# The branch the ratchets compare with: the remote's default branch, else HEAD (a fresh copy).
BASE_REF ?= $(shell git rev-parse -q --verify origin/HEAD >/dev/null && echo origin/HEAD \
	|| (git rev-parse -q --verify origin/main >/dev/null && echo origin/main) || echo HEAD)

.PHONY: setup dev run-worker format lint typecheck test test-integration test-tooling arch check migrate migration openapi secrets-scan docker-build clean

setup: ## Install the locked dependencies and the pre-commit and pre-push hooks
	uv sync --locked && uv run prek install

dev: ## Run the API with reload, fixture providers and the compose Postgres (COMPOSE=)
	$(COMPOSE) up -d --wait db && $(DEV_CMD)

run-worker: ## Run the job worker (never inside the web process)
	uv run procrastinate --app=app.worker.app worker

format: ## Format and apply safe lint fixes
	uv run ruff format && uv run ruff check --fix

lint: ## Format check, lint, dependencies and the suppression ratchet (BASE_REF=)
	uv run ruff format --check && uv run ruff check && uv run deptry src alembic
	uv run python -m scripts.quality.suppressions --base $(BASE_REF)

typecheck: ## mypy strict
	uv run mypy

test: ## Unit tests: no database, sockets disabled
	uv run pytest tests/unit -p socket --disable-socket --allow-unix-socket

test-integration: ## Integration, worker and concurrency tests against real Postgres (DATABASE_URL=)
	uv run pytest tests/integration

test-tooling: ## Tests of the scripts in scripts/
	uv run pytest tests/tooling

arch: ## Import contracts, the architecture tests, and the list of review items
	uv run lint-imports --no-cache && uv run pytest tests/architecture
	uv run python -m scripts.arch.review_items

check: lint typecheck test test-integration test-tooling arch secrets-scan ## Everything CI runs (DATABASE_URL=)
	uv run alembic upgrade head && uv run alembic check

migrate: ## Apply migrations up to head
	uv run alembic upgrade head

migration: ## Autogenerate a migration (name=)
	uv run alembic revision --autogenerate -m "$(name)"

openapi: ## Rewrite openapi.json from the app; review the diff
	uv run python -m scripts.openapi

secrets-scan: ## gitleaks over the full git history (needs the pinned gitleaks binary)
	@gitleaks version | grep -qx '$(GITLEAKS_VERSION)' || { echo "need gitleaks $(GITLEAKS_VERSION)"; exit 1; }
	gitleaks git --redact --no-banner

docker-build: ## Build the web, worker and migrate images (DOCKER= IMAGE=)
	for target in web worker migrate; do $(DOCKER) build --target $$target -t $(IMAGE)-$$target .; done

clean: ## Remove caches and build output
	rm -rf .mypy_cache .ruff_cache .pytest_cache dist build
