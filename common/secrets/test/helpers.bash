# Shared setup for the secrets CLI tests: a copy of the fixture app, a stub gcloud on PATH whose
# state lives in a temp dir, and a planted value that must never leak.
# shellcheck shell=bash

PLANTED='pl4nted-v4lue-7f3a9c'

setup_app() {
  CLI="$BATS_TEST_DIRNAME/../secrets"
  APP="$BATS_TEST_TMPDIR/app"
  mkdir -p "$APP"
  cp -R "$BATS_TEST_DIRNAME/fixtures/app/." "$APP"
  export SECRETS_MANIFEST="$APP/secrets.manifest.json"
  export STUB_STATE="$BATS_TEST_TMPDIR/cloud"
  mkdir -p "$STUB_STATE"
  : >"$STUB_STATE/argv.log"
  : >"$STUB_STATE/stdin.log"
  export PATH="$BATS_TEST_DIRNAME/stub:$PATH"
  export TMPDIR="$BATS_TEST_TMPDIR/tmp"
  mkdir -p "$TMPDIR"
  export SECRETS_TTY="$BATS_TEST_TMPDIR/no-terminal"
}

# secrets ARGS...: runs the CLI under SECRETS_BASH (CI sets /bin/bash on macOS to test bash 3.2).
secrets() { "${SECRETS_BASH:-bash}" "$CLI" "$@"; }

manifest_edit() {
  jq "$1" "$SECRETS_MANIFEST" >"$SECRETS_MANIFEST.new" && mv "$SECRETS_MANIFEST.new" "$SECRETS_MANIFEST"
}

# seed_secret ID [PROJECT]: an empty secret container in the stub cloud.
seed_secret() { mkdir -p "$STUB_STATE/sm/${2:-shop-dev}/$1"; }

# seed_version ID N STATE CREATED VALUE [PROJECT]
seed_version() {
  local d="$STUB_STATE/sm/${6:-shop-dev}/$1"
  mkdir -p "$d"
  printf '%s' "$3" >"$d/$2.state"
  printf '%s' "$4" >"$d/$2.time"
  printf '%s' "$5" >"$d/$2.data"
}

# seed_service KIND NAME SECRET VERSION [PROJECT]: a Cloud Run service or job reading SECRET as an env var.
seed_service() {
  local f="$STUB_STATE/run/${5:-shop-dev}/$1.json"
  mkdir -p "$(dirname "$f")"
  [ -f "$f" ] || echo '[]' >"$f"
  jq --arg n "$2" --arg s "$3" --arg v "$4" \
    '. + [{metadata: {name: $n}, spec: {template: {spec: {containers: [{env: [{name: "X", valueFrom: {secretKeyRef: {name: $s, key: $v}}}]}]}}}}]' \
    "$f" >"$f.new" && mv "$f.new" "$f"
}

state_of() { cat "$STUB_STATE/sm/${3:-shop-dev}/$1/$2.state"; }

pin_of() { jq -r --arg k "$1" '.[$k] // empty' "$APP/secret-versions/$2.json"; }

days_ago() { date -u -r "$(($(date +%s) - $1 * 86400))" +%Y-%m-%dT%H:%M:%S.000000Z 2>/dev/null ||
  date -u -d "@$(($(date +%s) - $1 * 86400))" +%Y-%m-%dT%H:%M:%S.000000Z; }

# assert_no_leak: the planted value is in no output, recorded argv, app file or temp file.
assert_no_leak() {
  if printf '%s' "${output:-}" | grep -qF "$PLANTED"; then echo "leak in output"; return 1; fi
  if grep -qF "$PLANTED" "$STUB_STATE/argv.log"; then echo "leak in argv"; return 1; fi
  if grep -rqF "$PLANTED" "$APP" "$TMPDIR"; then echo "leak in a file"; return 1; fi
}

# seed_healthy: dev in a clean state: every declared secret has an enabled, pinned, live version.
seed_healthy() {
  seed_version shop-payments-api-key-dev 1 ENABLED "$(days_ago 1)" "$PLANTED"
  seed_version shop-session-signing-key-dev 1 ENABLED "$(days_ago 1)" generated-value
  seed_version shop-error-tracker-upload-token-dev 1 ENABLED "$(days_ago 1)" ci-value
  mkdir -p "$APP/secret-versions"
  echo '{"error-tracker-upload-token": "1", "payments-api-key": "1"}' >"$APP/secret-versions/dev.json"
  seed_service services shop-web-dev shop-payments-api-key-dev 1
  seed_service services shop-web-dev shop-session-signing-key-dev 1
  seed_service jobs shop-migrate-dev shop-payments-api-key-dev 1
  mkdir -p "$STUB_STATE/iam/shop-dev"
  printf '%s\n' shop-web-dev@shop-dev.iam.gserviceaccount.com 123-compute@developer.gserviceaccount.com \
    >"$STUB_STATE/iam/shop-dev/service-accounts.txt"
  echo '{"bindings": [{"role": "roles/secretmanager.secretAccessor", "members": ["serviceAccount:shop-web-dev@shop-dev.iam.gserviceaccount.com"]}]}' \
    >"$STUB_STATE/iam/shop-dev/shop-payments-api-key-dev.json"
}
