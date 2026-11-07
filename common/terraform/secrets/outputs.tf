output "env_vars" {
  description = "Env var name => { secret, version, readers }, for Cloud Run secret_key_ref or volume items. A secret without a pinned version is left out, so a missing pin fails closed in the app."
  value = merge(
    {
      for k, v in local.secrets : upper(replace(k, "-", "_")) => {
        secret  = google_secret_manager_secret.this[k].secret_id
        version = tostring(local.pins[k])
        readers = v.readers
      } if !contains(keys(local.generated), k) && contains(keys(local.pins), k)
    },
    {
      for k, v in local.generated : upper(replace(k, "-", "_")) => {
        secret  = google_secret_manager_secret.this[k].secret_id
        version = google_secret_manager_secret_version.generated[k].version
        readers = v.readers
      }
    },
  )
}

output "secret_ids" {
  description = "Manifest purpose => secret id."
  value       = { for k, s in google_secret_manager_secret.this : k => s.secret_id }
}
