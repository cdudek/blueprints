#!/usr/bin/env bats
# A scratch Makefile that includes both .mk files prints the help list and calls the CLI with the
# right arguments; the default goal is help.

setup() {
  command -v make >/dev/null || skip "make is not installed"
  local mk="$BATS_TEST_DIRNAME/.."
  cd "$BATS_TEST_TMPDIR" || return 1
  cat >Makefile <<MAKEFILE
include $mk/common.mk $mk/secrets.mk

DEV_CMD := echo dev-server

.PHONY: test-integration
test-integration: ## Integration tests
	@echo not applicable
MAKEFILE
}

@test "help is the default goal and lists every target, grouped by family" {
  run make
  [ "$status" -eq 0 ]
  for t in help secret-list secret-check secret-set secret-rotate secret-retire secret-rename secret-rename-repo dev-real test-integration; do
    printf '%s\n' "$output" | grep -qE "^  $t +" || { echo "missing $t in: $output"; return 1; }
  done
  [ "$(printf '%s\n' "$output" | grep -n 'secret-check' | cut -d: -f1)" -lt "$(printf '%s\n' "$output" | grep -n 'secret-set ' | cut -d: -f1)" ]
}

@test "targets pass NAME, OLD, NEW, ENV and APPLY to the CLI" {
  run make -n secret-set NAME=payments-api-key ENV=prod
  [ "$status" -eq 0 ]
  printf '%s' "$output" | grep -qE 'common/secrets/secrets set payments-api-key --env prod$'
  run make -n secret-rename OLD=a-key NEW=b-key ENV=staging APPLY=1
  printf '%s' "$output" | grep -qE 'secrets rename a-key b-key --env staging +--apply$'
  run make -n secret-rename OLD=a-key NEW=b-key
  printf '%s' "$output" | grep -qE 'secrets rename a-key b-key --env dev +$'
  run make -n dev-real
  printf '%s' "$output" | grep -qE 'secrets dev-env -- echo dev-server$'
  run make -n secret-retire NAME=x DESTROY=1
  printf '%s' "$output" | grep -qE 'secrets retire x --env dev --destroy *$'
}

@test "a target the CLI rejects fails make" {
  run make secret-set ENV=dev
  [ "$status" -ne 0 ]
  printf '%s' "$output" | grep -q 'usage: secrets set NAME'
}
