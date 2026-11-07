# Root config for the plan test: the module against a stub project, planned with no credentials and
# no network (test/plan.bats).

terraform {
  required_version = ">= 1.11"
}

provider "google" {
  project      = "stub-project-dev"
  access_token = "not-a-token"
}

module "secrets" {
  source = "../.."

  manifest_path  = "${path.module}/secrets.manifest.json"
  env            = "dev"
  project        = "stub-project-dev"
  project_number = "100000000001"
  human_group    = "secrets-admins@example.com"
}

output "env_vars" {
  value = module.secrets.env_vars
}
