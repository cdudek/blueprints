# Secret containers, rotation notices and per-secret IAM from secrets.manifest.json. Never values,
# except generated ones, which go through a write-only argument and are never stored in plan or state.

locals {
  manifest  = jsondecode(file(var.manifest_path))
  pins_path = "${dirname(var.manifest_path)}/secret-versions/${var.env}.json"
  pins      = fileexists(local.pins_path) ? jsondecode(file(local.pins_path)) : {}

  repo      = local.manifest.repo
  secrets   = local.manifest.secrets
  generated = { for k, v in local.secrets : k => v if try(v.generated, null) != null }
  rotating  = { for k, v in local.secrets : k => v if try(v.rotationDays, null) != null }

  sa_domain   = "${var.project}.iam.gserviceaccount.com"
  human       = "group:${var.human_group}"
  ci_identity = "serviceAccount:${local.repo}-ci-${var.env}@${local.sa_domain}"

  # One entry per (secret, role, member).
  bindings = merge(
    merge([
      for k, v in local.secrets : {
        for kind in v.readers : "${k}/accessor/${kind}" => {
          secret = k
          role   = "roles/secretmanager.secretAccessor"
          member = "serviceAccount:${local.repo}-${kind}-${var.env}@${local.sa_domain}"
        }
      }
    ]...),
    { for k, v in local.secrets : "${k}/version-manager/human" => { secret = k, role = "roles/secretmanager.secretVersionManager", member = local.human } },
    { for k, v in local.secrets : "${k}/viewer/human" => { secret = k, role = "roles/secretmanager.viewer", member = local.human } },
    { for k, v in local.secrets : "${k}/viewer/ci" => { secret = k, role = "roles/secretmanager.viewer", member = local.ci_identity } },
    # People read values only in dev, and only for secrets marked local.
    { for k, v in local.secrets : "${k}/accessor/human" => { secret = k, role = "roles/secretmanager.secretAccessor", member = local.human } if var.env == "dev" && try(v.local, false) },
  )
}

resource "google_pubsub_topic" "rotation" {
  count   = length(local.rotating) > 0 ? 1 : 0
  project = var.project
  name    = "${local.repo}-secrets-rotation-${var.env}"
  labels  = { app = local.repo, env = var.env, role = "secrets-rotation" }
}

# Secret Manager publishes SECRET_ROTATE messages as its service agent. Create the agent once per
# project: gcloud beta services identity create --service secretmanager.googleapis.com --project PROJECT
resource "google_pubsub_topic_iam_member" "rotation_publisher" {
  count   = length(google_pubsub_topic.rotation)
  project = var.project
  topic   = google_pubsub_topic.rotation[0].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${var.project_number}@gcp-sa-secretmanager.iam.gserviceaccount.com"
}

resource "google_secret_manager_secret" "this" {
  for_each = local.secrets

  project   = var.project
  secret_id = "${local.repo}-${each.key}-${var.env}"
  labels    = { app = local.repo, env = var.env, role = "secret", owner = each.value.owner }

  replication {
    auto {}
  }

  # A destroyed version stays recoverable (disabled) for the rollback window.
  version_destroy_ttl = "${local.manifest.rollbackWindowDays * 86400}s"

  dynamic "topics" {
    for_each = contains(keys(local.rotating), each.key) ? [1] : []
    content {
      name = google_pubsub_topic.rotation[0].id
    }
  }

  # Secret Manager rotates nothing itself: it publishes a notice every period.
  dynamic "rotation" {
    for_each = contains(keys(local.rotating), each.key) ? [each.value.rotationDays] : []
    content {
      rotation_period    = "${rotation.value * 86400}s"
      next_rotation_time = timeadd(plantimestamp(), "${rotation.value * 24}h")
    }
  }

  lifecycle {
    # Set once; Secret Manager advances it after each notice.
    ignore_changes = [rotation[0].next_rotation_time]
  }

  depends_on = [google_pubsub_topic_iam_member.rotation_publisher]
}

resource "google_secret_manager_secret_iam_member" "this" {
  for_each = local.bindings

  project   = var.project
  secret_id = google_secret_manager_secret.this[each.value.secret].secret_id
  role      = each.value.role
  member    = each.value.member
}

ephemeral "random_password" "generated" {
  for_each = local.generated

  # At least 8 bits of entropy per declared byte: 2 alphanumeric characters carry about 11.9.
  length  = each.value.generated.bytes * 2
  special = false
}

resource "google_secret_manager_secret_version" "generated" {
  for_each = local.generated

  secret         = google_secret_manager_secret.this[each.key].id
  secret_data_wo = ephemeral.random_password.generated[each.key].result
  # secrets rotate bumps this generation in secret-versions/<env>.json to write a new value.
  secret_data_wo_version = tostring(lookup(local.pins, each.key, "1"))
  # A new generation leaves the old version enabled for running revisions; secrets retire disables it.
  deletion_policy = "ABANDON"
}
