# Shared Make settings for every stack. A stack's Makefile includes this file first, then secrets.mk,
# then defines DEV_CMD and the standard targets for its toolchain. A standard target with nothing to
# do prints "not applicable" and exits 0.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
MAKEFLAGS += --warn-undefined-variables --no-builtin-rules
.DEFAULT_GOAL := help

ENV ?= dev

.PHONY: help
help: ## List the targets
	@awk 'BEGIN { FS = ":[^#]*## " } /^[a-zA-Z0-9_-]+:[^=]*## / { printf "  %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST) | sort
