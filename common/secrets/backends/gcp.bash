# shellcheck shell=bash
# GCP backend: every Secret Manager, Cloud Run and IAM call the CLI makes. A second backend is one
# more file defining the same backend_* functions. Values travel only on stdin and stdout.
# A Cloud Run region comes from gcloud's own config (CLOUDSDK_RUN_REGION) when one is needed.

# backend_secret_ids PROJECT: one secret id per line.
backend_secret_ids() {
  gcloud secrets list --project "$1" --format='value(name.basename())'
}

# backend_versions PROJECT SECRET: "N<TAB>STATE<TAB>CREATED" per version, STATE in ENABLED|DISABLED|DESTROYED.
backend_versions() {
  gcloud secrets versions list "$2" --project "$1" --format='value(name.basename(),state,createTime)'
}

# backend_enabled_versions PROJECT SECRET: enabled version numbers, ascending.
backend_enabled_versions() {
  gcloud secrets versions list "$2" --project "$1" --filter=state=ENABLED --format='value(name.basename())' | sort -n
}

# backend_add_version PROJECT SECRET: reads the value on stdin, prints the new version number.
backend_add_version() {
  gcloud secrets versions add "$2" --project "$1" --data-file=- --format='value(name.basename())'
}

# backend_access_version PROJECT SECRET VERSION: prints the value on stdout, for a pipe or a capture only.
backend_access_version() {
  gcloud secrets versions access "$3" --secret "$2" --project "$1"
}

backend_disable_version() {
  gcloud secrets versions disable "$3" --secret "$2" --project "$1" --quiet >/dev/null
}

backend_destroy_version() {
  gcloud secrets versions destroy "$3" --secret "$2" --project "$1" --quiet >/dev/null
}

# backend_accessors PROJECT SECRET: the members holding secretAccessor, comma-separated.
backend_accessors() {
  gcloud secrets get-iam-policy "$2" --project "$1" --format=json |
    jq -r '[.bindings[]? | select(.role == "roles/secretmanager.secretAccessor") | .members[]] | join(",")'
}

# backend_live_refs PROJECT: "RESOURCE<TAB>SECRET<TAB>VERSION" for every secret a Cloud Run service or
# job reads, as an env var (secretKeyRef) or a volume (an item per version; no items means latest).
backend_live_refs() {
  {
    gcloud run services list --project "$1" --format=json
    gcloud run jobs list --project "$1" --format=json
  } | jq -rs '
    .[] | .[] | .metadata.name as $r
    | ([.. | objects | select(has("secretKeyRef")) | .secretKeyRef | {s: .name, v: (.key // "latest")}]
       + [.. | objects | select((.secret | type) == "object" and (.secret | has("secretName"))) | .secret
          | .secretName as $s | (.items // [{key: "latest"}])[] | {s: $s, v: .key}])
    | .[] | "\($r)\t\(.s | split("/") | last)\t\(.v | tostring | split("/") | last)"'
}

# backend_resource_names PROJECT: "TYPE<TAB>NAME" for Cloud Run services and jobs and the project's own
# service accounts (TYPE is service, job or sa).
backend_resource_names() {
  gcloud run services list --project "$1" --format='value(metadata.name)' | sed 's/^/service	/'
  gcloud run jobs list --project "$1" --format='value(metadata.name)' | sed 's/^/job	/'
  gcloud iam service-accounts list --project "$1" --format='value(email)' |
    { grep "@$1\.iam\.gserviceaccount\.com\$" || true; } | sed 's/@.*//; s/^/sa	/'
}

# backend_access_grant_hint PROJECT SECRET UNTIL: the time-bound grant an admin makes for a rename.
backend_access_grant_hint() {
  printf '  gcloud secrets add-iam-policy-binding %s --project %s \\\n' "$2" "$1"
  printf '    --member=user:PERSON@EXAMPLE.COM --role=roles/secretmanager.secretAccessor \\\n'
  printf '    --condition='\''expression=request.time < timestamp("%s"),title=rename-%s'\''\n' "$3" "$2"
}
