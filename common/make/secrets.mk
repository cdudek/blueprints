# Secrets targets: each one line calling the vendored CLI. Values are never passed to make: set and
# rotate read a hidden prompt in the human's own terminal.

SECRETS_CLI := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))../secrets/secrets)

NAME ?=
OLD ?=
NEW ?=
APPLY ?=
DESTROY ?=
ALL ?=
DEV_CMD ?=

.PHONY: secret-list secret-check secret-set secret-rotate secret-retire secret-rename secret-rename-repo dev-real

secret-list: ## Secrets with versions, pins and readers (ENV=)
	@$(SECRETS_CLI) list --env $(ENV)

secret-check: ## Manifest, naming, pins and live references; fails on drift (ENV=)
	@$(SECRETS_CLI) check --env $(ENV)

secret-set: ## Add a version from a hidden prompt; human only (NAME= ENV=)
	@$(SECRETS_CLI) set $(NAME) --env $(ENV)

secret-rotate: ## Rotate; rerun after the rollout to disable old versions; human only (NAME= ENV=)
	@$(SECRETS_CLI) rotate $(NAME) --env $(ENV)

secret-retire: ## Disable, then destroy, versions past the rollback window; human only (NAME= ENV= DESTROY=1 ALL=1)
	@$(SECRETS_CLI) retire $(NAME) --env $(ENV) $(if $(DESTROY),--destroy) $(if $(ALL),--all)

secret-rename: ## Copy a secret to a new name; dry run unless APPLY=1 (OLD= NEW= ENV=)
	@$(SECRETS_CLI) rename $(OLD) $(NEW) --env $(ENV) $(if $(APPLY),--apply)

secret-rename-repo: ## Copy every secret to a new repo name; dry run unless APPLY=1 (OLD= NEW= ENV=)
	@$(SECRETS_CLI) rename-repo $(OLD) $(NEW) --env $(ENV) $(if $(APPLY),--apply)

dev-real: ## Run DEV_CMD with the real dev values of local secrets; human only
	@$(SECRETS_CLI) dev-env -- $(DEV_CMD)
