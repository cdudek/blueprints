#!/usr/bin/env bats
# list, check and env-names against a stub gcloud: each drift case is reported, and nothing prints a value.

load helpers

setup() {
  setup_app
  seed_healthy
}

has() { printf '%s' "$output" | grep -qF -- "$1" || { echo "expected '$1' in: $output"; return 1; }; }

@test "env-names prints the declared env var names and calls no cloud API" {
  run secrets env-names
  [ "$status" -eq 0 ]
  [ "$output" = "$(printf 'ERROR_TRACKER_UPLOAD_TOKEN\nPAYMENTS_API_KEY\nSESSION_SIGNING_KEY')" ]
  [ ! -s "$STUB_STATE/argv.log" ]
}

@test "list shows pins, enabled versions and readers, never values" {
  run secrets list --env dev
  [ "$status" -eq 0 ]
  has "shop-payments-api-key-dev	pinned=1	enabled=1@"
  has "readers=serviceAccount:shop-web-dev@shop-dev.iam.gserviceaccount.com"
  has "shop-session-signing-key-dev	pinned=generated"
  assert_no_leak
}

@test "list marks a declared secret that does not exist" {
  run secrets list --env staging
  [ "$status" -eq 0 ]
  has "staging	shop-payments-api-key-staging	missing"
}

@test "check passes on a clean environment and reports the CI exception" {
  run secrets check --env dev
  [ "$status" -eq 0 ]
  has "check: 0 drift"
  has "WARN  error-tracker-upload-token: CI exception"
  assert_no_leak
}

@test "check reports a declared secret missing in Secret Manager" {
  rm -rf "$STUB_STATE/sm/shop-dev/shop-session-signing-key-dev"
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "DRIFT dev shop-session-signing-key-dev: declared but missing"
}

@test "check reports an undeclared secret" {
  seed_secret shop-old-key-dev
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "DRIFT dev shop-old-key-dev: in Secret Manager but not declared"
}

@test "check reports a secret with no enabled version" {
  printf DISABLED >"$STUB_STATE/sm/shop-dev/shop-error-tracker-upload-token-dev/1.state"
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "DRIFT dev shop-error-tracker-upload-token-dev: no enabled version"
}

@test "check reports a missing pin" {
  echo '{"error-tracker-upload-token": "1"}' >"$APP/secret-versions/dev.json"
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "DRIFT dev shop-payments-api-key-dev: no pinned version"
}

@test "check reports a pin that does not exist" {
  echo '{"error-tracker-upload-token": "1", "payments-api-key": "7"}' >"$APP/secret-versions/dev.json"
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "pinned version 7 does not exist"
}

@test "check reports a pinned version that is disabled" {
  seed_version shop-payments-api-key-dev 2 ENABLED "$(days_ago 0)" other
  printf DISABLED >"$STUB_STATE/sm/shop-dev/shop-payments-api-key-dev/1.state"
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "pinned version 1 is DISABLED"
}

@test "check lists a newer version that is not rolled out, without failing" {
  seed_version shop-payments-api-key-dev 2 ENABLED "$(days_ago 0)" other
  run secrets check --env dev
  [ "$status" -eq 0 ]
  has "WARN  dev shop-payments-api-key-dev: version 2 is newer than the pin 1 and not rolled out"
}

@test "check reports a live revision that reads another version than the pin" {
  seed_version shop-payments-api-key-dev 2 ENABLED "$(days_ago 0)" other
  echo '{"error-tracker-upload-token": "1", "payments-api-key": "2"}' >"$APP/secret-versions/dev.json"
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "DRIFT dev shop-payments-api-key-dev: shop-web-dev reads version 1, the pin is 2"
  has "shop-migrate-dev reads version 1"
}

@test "check reports a live revision that reads latest" {
  seed_service services shop-worker-dev shop-payments-api-key-dev latest
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "DRIFT dev shop-payments-api-key-dev: shop-worker-dev reads latest"
}

@test "check warns on overdue rotation" {
  seed_version shop-payments-api-key-dev 1 ENABLED "$(days_ago 120)" "$PLANTED"
  run secrets check --env dev
  [ "$status" -eq 0 ]
  has "rotation overdue, newest version is 120 days old"
}

@test "check warns on old versions still enabled past the rollback window" {
  seed_version shop-payments-api-key-dev 1 ENABLED "$(days_ago 30)" old
  seed_version shop-payments-api-key-dev 2 ENABLED "$(days_ago 10)" "$PLANTED"
  echo '{"error-tracker-upload-token": "1", "payments-api-key": "2"}' >"$APP/secret-versions/dev.json"
  seed_service services shop-api-dev shop-payments-api-key-dev 2
  rm "$STUB_STATE/run/shop-dev/services.json" "$STUB_STATE/run/shop-dev/jobs.json"
  run secrets check --env dev
  [ "$status" -eq 0 ]
  has "versions 1 are older than the live version 2 and past the 7-day rollback window"
}

@test "check reports live resource names that break the naming rule" {
  seed_service services payments-frontend shop-payments-api-key-dev 1
  echo legacy-runner@shop-dev.iam.gserviceaccount.com >>"$STUB_STATE/iam/shop-dev/service-accounts.txt"
  run secrets check --env dev
  [ "$status" -eq 1 ]
  has "DRIFT dev service payments-frontend: breaks <repo>-<kind>-<env>"
  has "DRIFT dev sa legacy-runner: breaks"
  if printf '%s' "$output" | grep -q 123-compute; then echo "a default service account was checked"; return 1; fi
}

@test "check without --env walks every environment" {
  run secrets check
  [ "$status" -eq 1 ]
  has "DRIFT staging shop-payments-api-key-staging: declared but missing"
  has "DRIFT prod shop-payments-api-key-prod: declared but missing"
}

@test "an environment outside the manifest is refused" {
  run secrets check --env qa
  [ "$status" -eq 1 ]
  has "must match"
  run secrets check --env pr-12
  [ "$status" -eq 1 ]
  has "not in the manifest's envs"
}

@test "projects in the manifest choose the GCP project" {
  manifest_edit '.projects = {"dev": "shop-dev-4821"}'
  run secrets list --env dev
  grep -q -- '--project shop-dev-4821' "$STUB_STATE/argv.log"
}
