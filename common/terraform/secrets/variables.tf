variable "manifest_path" {
  description = "Path to the app's secrets.manifest.json; secret-versions/<env>.json is read from beside it."
  type        = string
}

variable "env" {
  description = "Environment: dev, staging, prod or pr-<n>. Must be one of the manifest's envs."
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod|pr-[0-9]{1,4})$", var.env)) && contains(jsondecode(file(var.manifest_path)).envs, var.env)
    error_message = "env must match ^(dev|staging|prod|pr-[0-9]{1,4})$ and be listed in the manifest's envs."
  }
}

variable "project" {
  description = "GCP project id of this environment."
  type        = string
}

variable "project_number" {
  description = "GCP project number, for the Secret Manager service agent that publishes rotation notices."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number is the numeric project number, not the project id."
  }
}

variable "human_group" {
  description = "Email of the group whose members add, enable and disable versions (no payload access outside dev)."
  type        = string

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+$", var.human_group))
    error_message = "human_group is a group email address."
  }
}
