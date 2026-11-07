#!/usr/bin/env bats
# rename and rename-repo: dry runs change nothing; --apply copies the newest enabled version on a
# pipe-free path (shell variable, stdin), leaves the old secret readable until retire, and leaks nothing.

load helpers

setup() {
  setup_app
  seed_healthy
}

has() { printf '%s' "$output" | grep -qF -- "$1" || { echo "expected '$1' in: $output"; return 1; }; }
no_write() {
  if grep -qE 'versions (add|access)' "$STUB_STATE/argv.log"; then echo "a value was read or written"; return 1; fi
}
snapshot() { (cd "$APP" && find . -type f -exec cksum {} + | sort) }

declare_new() {
  manifest_edit '.secrets["payments-secret-key"] = .secrets["payments-api-key"]'
  seed_secret shop-payments-secret-key-dev
}

@test "rename without --apply shows the plan and changes nothing" {
  before=$(snapshot)
  run secrets rename payments-api-key payments-secret-key --env dev
  [ "$status" -eq 0 ]
  has "rename (dry run, nothing changes): shop-payments-api-key-dev -> shop-payments-secret-key-dev"
  has "env var: PAYMENTS_API_KEY -> PAYMENTS_SECRET_KEY"
  has '+ {'
  [ "$(snapshot)" = "$before" ]
  no_write
}

@test "rename --apply refuses a NEW that is not declared" {
  run secrets rename payments-api-key payments-secret-key --env dev --apply
  [ "$status" -eq 1 ]
  has 'declare "payments-secret-key"'
  no_write
}

@test "rename --apply copies the newest enabled version, pins it and leaves OLD readable" {
  declare_new
  seed_version shop-payments-api-key-dev 1 ENABLED "$(days_ago 40)" old
  seed_version shop-payments-api-key-dev 2 ENABLED "$(days_ago 9)" "$PLANTED"
  seed_version shop-payments-api-key-dev 3 DISABLED "$(days_ago 1)" bad
  run secrets rename payments-api-key payments-secret-key --env dev --apply
  [ "$status" -eq 0 ]
  has "version 2 copied to shop-payments-secret-key-dev version 1"
  grep -qx 'secrets versions access 2 --secret shop-payments-api-key-dev --project shop-dev' "$STUB_STATE/argv.log"
  [ "$(cat "$STUB_STATE/sm/shop-dev/shop-payments-secret-key-dev/1.data")" = "$PLANTED" ]
  [ "$(pin_of payments-secret-key dev)" = 1 ]
  [ "$(state_of shop-payments-api-key-dev 2)" = ENABLED ]
  assert_no_leak
}

@test "after rename, OLD stays enabled until retire --all once nothing reads it" {
  declare_new
  run secrets rename payments-api-key payments-secret-key --env dev --apply
  [ "$status" -eq 0 ]
  run secrets check --env dev
  [ "$(state_of shop-payments-api-key-dev 1)" = ENABLED ]
  rm "$STUB_STATE/run/shop-dev/services.json" "$STUB_STATE/run/shop-dev/jobs.json"
  run secrets retire payments-api-key --env dev --all
  [ "$status" -eq 0 ]
  [ "$(state_of shop-payments-api-key-dev 1)" = DISABLED ]
  [ "$(state_of shop-payments-secret-key-dev 1)" = ENABLED ]
}

@test "rename --apply without payload access prints the time-bound grant and copies nothing" {
  declare_new
  STUB_DENY_ACCESS=1 run secrets rename payments-api-key payments-secret-key --env dev --apply
  [ "$status" -eq 1 ]
  has "Nobody holds standing payload access"
  has "gcloud secrets add-iam-policy-binding shop-payments-api-key-dev --project shop-dev"
  has "request.time < timestamp("
  if grep -q 'versions add' "$STUB_STATE/argv.log"; then echo "a version was added"; return 1; fi
}

@test "rename refuses a generated NEW" {
  manifest_edit '.secrets["session-key"] = .secrets["session-signing-key"]'
  seed_secret shop-session-key-dev
  run secrets rename session-signing-key session-key --env dev --apply
  [ "$status" -eq 1 ]
  has "is generated"
  no_write
}

seed_legacy() {
  manifest_edit '.projects = {"dev": "shop-dev"}'
  seed_version legacy-payments-api-key-dev 1 ENABLED "$(days_ago 9)" "$PLANTED"
  seed_version legacy-session-signing-key-dev 1 ENABLED "$(days_ago 9)" generated-old
}

@test "rename-repo without --apply lists the pairs and the manifest diff and changes nothing" {
  seed_legacy
  manifest_edit '.repo = "legacy"'
  before=$(snapshot)
  run secrets rename-repo legacy shop --env dev
  [ "$status" -eq 0 ]
  has "legacy-payments-api-key-dev -> shop-payments-api-key-dev"
  has "legacy-session-signing-key-dev -> shop-session-signing-key-dev"
  has '-   "repo": "legacy",'
  has '+   "repo": "shop",'
  [ "$(snapshot)" = "$before" ]
  no_write
}

@test "rename-repo needs the project pinned in the manifest" {
  run secrets rename-repo legacy shop --env dev
  [ "$status" -eq 1 ]
  has "set projects.dev in the manifest first"
}

@test "rename-repo --apply needs a terminal for its confirmation" {
  seed_legacy
  run secrets rename-repo legacy shop --env dev --apply
  [ "$status" -eq 1 ]
  has "run this in your own terminal"
  no_write
}

@test "rename-repo --apply stops on a wrong confirmation" {
  seed_legacy
  echo no >"$BATS_TEST_TMPDIR/terminal"
  SECRETS_TTY="$BATS_TEST_TMPDIR/terminal" run secrets rename-repo legacy shop --env dev --apply
  [ "$status" -eq 1 ]
  has "not confirmed; nothing copied"
  no_write
}

@test "rename-repo --apply copies every non-generated secret after one confirmation" {
  seed_legacy
  echo shop >"$BATS_TEST_TMPDIR/terminal"
  SECRETS_TTY="$BATS_TEST_TMPDIR/terminal" run secrets rename-repo legacy shop --env dev --apply
  [ "$status" -eq 0 ]
  has "Copy 2 secrets from legacy-*-dev to shop-*-dev in shop-dev? Type shop to go on:"
  has "legacy-payments-api-key-dev version 1 copied to shop-payments-api-key-dev version 2"
  has "shop-session-signing-key-dev: generated"
  [ "$(pin_of payments-api-key dev)" = 2 ]
  [ "$(cat "$STUB_STATE/sm/shop-dev/shop-payments-api-key-dev/2.data")" = "$PLANTED" ]
  [ "$(state_of legacy-payments-api-key-dev 1)" = ENABLED ]
  assert_no_leak
}
