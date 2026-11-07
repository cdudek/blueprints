# Entry points. Every target is a thin wrapper over `uv run`; longer logic lives in scripts/.
# CI calls the same targets. GNU Make 3.81 (macOS) ignores .SHELLFLAGS; recipes still run in bash.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
MAKEFLAGS += --warn-undefined-variables --no-builtin-rules
.DEFAULT_GOAL := help

COMPOSE ?= docker compose

.PHONY: help setup dev format lint typecheck test check clean

help: ## List the targets
	@awk 'BEGIN { FS = ":[^#]*## " } /^[a-zA-Z0-9_-]+:[^=]*## / { printf "  %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST) | sort

setup: ## Install the locked dependencies and the pre-commit and pre-push hooks
	uv sync --locked && uv run prek install

dev: ## Run the API with reload, fixture providers and the compose Postgres (COMPOSE=)
	$(COMPOSE) up -d --wait db && uv run fastapi dev src/app/main.py

format: ## Format and apply safe lint fixes
	uv run ruff format && uv run ruff check --fix

lint: ## Format check and lint
	uv run ruff format --check && uv run ruff check

typecheck: ## mypy strict
	uv run mypy

test: ## Unit tests: no database, sockets disabled
	uv run pytest tests/unit -p socket --disable-socket --allow-unix-socket

check: lint typecheck test ## Everything CI runs

clean: ## Remove caches and build output
	rm -rf .mypy_cache .ruff_cache .pytest_cache dist build
