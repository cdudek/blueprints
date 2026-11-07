#!/usr/bin/env bats
# The naming regexes accept every worked-example name and reject names that are too long, use a
# wrong environment spelling or break the case rules.

setup() {
  # shellcheck source=../secrets
  . "$BATS_TEST_DIRNAME/../secrets"
}

accept() { name_ok "$@" || { echo "rejected: $*"; return 1; }; }
reject() { if name_ok "$@"; then echo "accepted: $*"; return 1; fi; }

@test "env accepts the three spellings and previews" {
  for v in dev staging prod pr-1 pr-9999; do accept env "$v"; done
}

@test "env rejects other spellings" {
  for v in development stage production Prod pr- pr-10000 pr-1a ""; do reject env "$v"; done
}

@test "repo accepts 3 to 11 lowercase characters" {
  for v in shop abc shop-api abcdefghijk a1b; do accept repo "$v"; done
}

@test "repo rejects too short, too long, case and edges" {
  for v in ab abcdefghijkl Shop shop_api shop. -shop shop- 1shop ""; do reject repo "$v"; done
}

@test "kind accepts the vocabulary and extra services" {
  for v in web worker migrate ci deploy images files tfstate sql secrets-rotation transcribe ab; do accept kind "$v"; done
}

@test "kind rejects long, cased and dashed-edge kinds" {
  for v in transcriber1 Web web- -web w ""; do reject kind "$v"; done
}

@test "resource names from the worked example are accepted" {
  for env in dev staging prod; do
    for k in web worker migrate transcribe images files tfstate sql ci deploy secrets-rotation; do
      accept resource "shop-$k-$env" shop "$env"
    done
  done
}

@test "service account names are at most 30 characters" {
  accept sa abcdefghijk-abcdefghij-staging abcdefghijk staging
  reject sa abcdefghijk-secrets-rotation-staging abcdefghijk staging
}

@test "resource names with the wrong repo, env or case are rejected" {
  reject resource shop-web-production shop prod
  reject resource shop-web-dev shop prod
  reject resource other-web-prod shop prod
  reject resource shop-Web-prod shop prod
  reject resource shop-web_prod shop prod
  reject resource shop-transcriber1-prod shop prod
}

@test "secret names from the worked example are accepted" {
  for env in dev staging prod pr-12; do accept secret "shop-payments-api-key-$env" shop "$env"; done
  accept secret shop-session-signing-key-prod shop prod
}

@test "secret names that break the rule are rejected" {
  reject secret shop-payments_api_key-prod shop prod
  reject secret shop-Payments-api-key-prod shop prod
  reject secret shop-payments-api-key-production shop prod
  reject secret payments-api-key-prod shop prod
  reject secret shop-prod shop prod
  reject secret shop--key-prod shop prod
  reject secret "shop-$(printf 'a%.0s' $(seq 1 250))-prod" shop prod
}

@test "env var names are derived UPPER_SNAKE" {
  [ "$(to_envvar payments-api-key)" = PAYMENTS_API_KEY ]
  accept envvar PAYMENTS_API_KEY
  reject envvar payments_api_key
  reject envvar 1KEY
}

@test "database names use underscores" {
  accept db shop_prod shop prod
  accept db shop_api_pr_12 shop-api pr-12
  reject db shop-prod shop prod
  reject db shop_production shop prod
}
