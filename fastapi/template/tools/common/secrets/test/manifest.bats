#!/usr/bin/env bats
# shellcheck disable=SC2034 # MANIFEST is read by the sourced CLI functions
# The manifest is validated with jq (structure) and the naming regexes (names).

load helpers

setup() {
  setup_app
  # shellcheck source=../secrets
  . "$CLI"
}

invalid() {
  manifest_edit "$1"
  MANIFEST=$SECRETS_MANIFEST
  run validate_manifest
  [ "$status" -eq 1 ]
  printf '%s' "$output" | grep -qF -- "$2" || { echo "expected '$2' in: $output"; return 1; }
}

@test "the fixture manifest is valid" {
  MANIFEST=$SECRETS_MANIFEST
  run validate_manifest
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "the JSON Schema for editors uses the same regexes as the CLI" {
  local schema="$BATS_TEST_DIRNAME/../manifest.schema.json"
  [ "$(jq -r .properties.repo.pattern "$schema")" = "$RE_REPO" ]
  [ "$(jq -r .properties.envs.items.pattern "$schema")" = "$RE_ENV" ]
  [ "$(jq -r '.["$defs"].secret.properties.readers.items.pattern' "$schema")" = "$RE_KIND" ]
  [ "$(jq -r .properties.secrets.propertyNames.pattern "$schema")" = "$RE_PURPOSE" ]
  [ "$(jq -r '.properties.projects.additionalProperties.pattern' "$schema")" = "$RE_PROJECT" ]
}

@test "unknown top-level and secret keys are refused" {
  invalid '.extra = 1' 'unknown key extra'
}

@test "an unknown key inside a secret is refused" {
  invalid '.secrets["payments-api-key"].value = "x"' 'unknown key value'
}

@test "a bad repo is refused" {
  invalid '.repo = "shop-platform-backend"' "repo: 'shop-platform-backend'"
}

@test "a wrong environment spelling is refused" {
  invalid '.envs = ["dev", "production"]' "envs: 'production'"
}

@test "a purpose that is not kebab-case is refused" {
  invalid '.secrets.Payments_Key = .secrets["payments-api-key"]' 'Payments_Key: purpose must be lowercase kebab-case'
}

@test "a purpose that repeats the repo or the environment is refused" {
  invalid '.secrets["shop-key"] = .secrets["payments-api-key"]' "must not repeat the repo"
}

@test "a purpose that repeats an environment is refused" {
  invalid '.secrets["prod-key"] = .secrets["payments-api-key"]' "must not repeat the environment 'prod'"
}

@test "a reader kind that is not in the vocabulary is refused" {
  invalid '.secrets["payments-api-key"].readers = ["transcriber1"]' "'transcriber1' is not a kind"
}

@test "a reader whose service account would pass 30 characters is refused" {
  invalid '.repo = "abcdefghijk" | .secrets["payments-api-key"].readers = ["secrets-rotation"]' 'breaks the naming rule or 30 characters'
}

@test "ci needs a reason" {
  invalid 'del(.secrets["error-tracker-upload-token"].ciReason)' 'ci needs a ciReason'
}

@test "a generated secret has no probe" {
  invalid '.secrets["session-signing-key"].probe = "probes/x.sh"' 'a generated secret has no probe'
}

@test "generated needs bytes between 16 and 512" {
  invalid '.secrets["session-signing-key"].generated.bytes = 8' 'generated: must be'
}

@test "the owner must be a label value" {
  invalid '.secrets["payments-api-key"].owner = "Billing Team"' 'is not a label value'
}

@test "a projects entry must name a declared environment and a project id" {
  invalid '.projects = {"qa": "shop-qa"}' 'projects.qa: not one of envs'
}

@test "a newer schemaVersion warns that tools/common is too old" {
  manifest_edit '.schemaVersion = 2'
  MANIFEST=$SECRETS_MANIFEST
  run validate_manifest
  [ "$status" -eq 0 ]
  printf '%s' "$output" | grep -qF 'upgrade tools/common'
}

@test "invalid JSON is reported" {
  printf '{' >"$SECRETS_MANIFEST"
  MANIFEST=$SECRETS_MANIFEST
  run validate_manifest
  [ "$status" -eq 1 ]
  printf '%s' "$output" | grep -qF 'not valid JSON'
}
