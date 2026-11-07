# A web service, a worker and a migrate job reading their secrets through the module's env_vars map,
# each as an env var at a pinned version. Names follow <repo>-<kind>-<env>.

terraform {
  required_version = ">= 1.11"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

variable "project" {
  type = string
}

variable "project_number" {
  type = string
}

variable "region" {
  type = string
}

variable "env" {
  type    = string
  default = "dev"
}

variable "human_group" {
  type = string
}

variable "image" {
  description = "Image reference, for example <region>-docker.pkg.dev/<project>/<repo>-images-<env>/app@sha256:..."
  type        = string
}

provider "google" {
  project = var.project
  region  = var.region
}

module "secrets" {
  source = "../.."

  manifest_path  = "${path.module}/secrets.manifest.json"
  env            = var.env
  project        = var.project
  project_number = var.project_number
  human_group    = var.human_group
}

locals {
  repo = jsondecode(file("${path.module}/secrets.manifest.json")).repo

  # Env var name => { secret, version } for the secrets each kind reads.
  secret_env = {
    for kind in ["web", "worker", "migrate"] : kind => {
      for name, ref in module.secrets.env_vars : name => ref if contains(ref.readers, kind)
    }
  }
}

resource "google_cloud_run_v2_service" "web" {
  name     = "${local.repo}-web-${var.env}"
  location = var.region
  labels   = { app = local.repo, env = var.env, role = "web", owner = "platform" }

  template {
    service_account = "${local.repo}-web-${var.env}@${var.project}.iam.gserviceaccount.com"
    containers {
      image = var.image
      dynamic "env" {
        for_each = local.secret_env.web
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "worker" {
  name     = "${local.repo}-worker-${var.env}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  labels   = { app = local.repo, env = var.env, role = "worker", owner = "platform" }

  template {
    service_account = "${local.repo}-worker-${var.env}@${var.project}.iam.gserviceaccount.com"
    containers {
      image   = var.image
      command = ["run-worker"]
      dynamic "env" {
        for_each = local.secret_env.worker
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_job" "migrate" {
  name     = "${local.repo}-migrate-${var.env}"
  location = var.region
  labels   = { app = local.repo, env = var.env, role = "migrate", owner = "platform" }

  template {
    template {
      service_account = "${local.repo}-migrate-${var.env}@${var.project}.iam.gserviceaccount.com"
      containers {
        image   = var.image
        command = ["migrate"]
        dynamic "env" {
          for_each = local.secret_env.migrate
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value.secret
                version = env.value.version
              }
            }
          }
        }
      }
    }
  }
}
