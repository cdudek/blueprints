#!/usr/bin/env bats
# terraform validate for the module and the Cloud Run example, and a plan against a stub project
# whose JSON holds no generated value. Runs offline after init: no credentials, and a dead proxy
# makes any API call fail. Provider downloads honour TF_PLUGIN_CACHE_DIR.

setup() {
  command -v terraform >/dev/null || skip "terraform is not installed"
  # Work on a copy, so init leaves no .terraform or lock file in the repository.
  cp -R "$BATS_TEST_DIRNAME/.." "$BATS_TEST_TMPDIR/secrets"
  MODULE="$BATS_TEST_TMPDIR/secrets"
  export TF_IN_AUTOMATION=1 TF_INPUT=0 CHECKPOINT_DISABLE=1
}

# tf DIR SUBCOMMAND ARGS...: terraform in DIR, with its data dir inside the copy.
tf() {
  local dir=$1 sub=$2
  shift 2
  TF_DATA_DIR="$dir/.terraform" terraform -chdir="$dir" "$sub" -no-color "$@"
}

offline() { HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 NO_PROXY='' "$@"; }

@test "the module and the Cloud Run example pass terraform fmt and validate" {
  terraform fmt -check -recursive "$MODULE"
  tf "$MODULE" init -backend=false >/dev/null
  tf "$MODULE" validate
  tf "$MODULE/examples/cloud-run" init -backend=false >/dev/null
  tf "$MODULE/examples/cloud-run" validate
}

@test "the plan for a generated secret contains no value" {
  local dir="$MODULE/test/fixture"
  tf "$dir" init -backend=false >/dev/null
  offline tf "$dir" plan -refresh=false -out="$BATS_TEST_TMPDIR/plan.bin" >/dev/null
  tf "$dir" show -json "$BATS_TEST_TMPDIR/plan.bin" >"$BATS_TEST_TMPDIR/plan.json"
  local plan="$BATS_TEST_TMPDIR/plan.json"

  # The generated version is planned, with its write-only argument absent from the plan.
  [ "$(jq -r '.resource_changes[] | select(.type == "google_secret_manager_secret_version") | .change.after.secret_data_wo' "$plan")" = null ]
  [ "$(jq -r '.resource_changes[] | select(.type == "google_secret_manager_secret_version") | .change.after.secret_data' "$plan")" = null ]
  # Ephemeral resources are never part of the plan's changes.
  [ "$(jq '[.resource_changes[] | select(.type == "random_password")] | length' "$plan")" -eq 0 ]
  # The generated value is 64 alphanumeric characters (32 bytes x 2); nothing like it is in the plan.
  if grep -qE '[A-Za-z0-9]{64}' "$plan"; then echo "a 64-character token is in the plan"; return 1; fi

  # Names, labels, IAM and the env var map follow the manifest.
  [ "$(jq -r '.output_changes.env_vars.after.PAYMENTS_API_KEY.secret' "$plan")" = shop-payments-api-key-dev ]
  [ "$(jq -r '.output_changes.env_vars.after.PAYMENTS_API_KEY.version' "$plan")" = 1 ]
  jq -e '[.resource_changes[] | select(.type == "google_secret_manager_secret_iam_member") | .change.after.member]
    | index("serviceAccount:shop-web-dev@stub-project-dev.iam.gserviceaccount.com")' "$plan"
  jq -e '[.resource_changes[] | select(.type == "google_pubsub_topic") | .change.after.name] == ["shop-secrets-rotation-dev"]' "$plan"
}
