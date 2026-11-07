# Entry points. Every target is a thin wrapper over `uv run`; longer logic lives in scripts/.
# CI calls the same targets. GNU Make 3.81 (macOS) ignores .SHELLFLAGS; recipes still run in bash.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
MAKEFLAGS += --warn-undefined-variables --no-builtin-rules
.DEFAULT_GOAL := help

COMPOSE ?= docker compose
name ?=

.PHONY: help setup dev run-worker format lint typecheck test test-integration arch check migrate migration clean

help: ## List the targets
	@awk 'BEGIN { FS = ":[^#]*## " } /^[a-zA-Z0-9_-]+:[^=]*## / { printf "  %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST) | sort

setup: ## Install the locked dependencies and the pre-commit and pre-push hooks
	uv sync --locked && uv run prek install

dev: ## Run the API with reload, fixture providers and the compose Postgres (COMPOSE=)
	$(COMPOSE) up -d --wait db && uv run fastapi dev src/app/main.py

run-worker: ## Run the job worker (never inside the web process)
	uv run procrastinate --app=app.worker.app worker

format: ## Format and apply safe lint fixes
	uv run ruff format && uv run ruff check --fix

lint: ## Format check and lint
	uv run ruff format --check && uv run ruff check

typecheck: ## mypy strict
	uv run mypy

test: ## Unit tests: no database, sockets disabled
	uv run pytest tests/unit -p socket --disable-socket --allow-unix-socket

test-integration: ## Integration, worker and concurrency tests against real Postgres (DATABASE_URL=)
	uv run pytest tests/integration

arch: ## Import contracts and the architecture tests
	uv run lint-imports --no-cache && uv run pytest tests/architecture

check: lint typecheck test test-integration arch ## Everything CI runs

migrate: ## Apply migrations up to head
	uv run alembic upgrade head

migration: ## Autogenerate a migration (name=)
	uv run alembic revision --autogenerate -m "$(name)"

clean: ## Remove caches and build output
	rm -rf .mypy_cache .ruff_cache .pytest_cache dist build
