# Renaming a repository

A repository rename is a migration, not a rename. These names are fixed when the resource is
created:

- secrets ("You can't edit the secret name or value and the replication policy");
- service account IDs ("can't change the ID after you create");
- buckets ("You cannot change the name of an existing bucket");
- Cloud Run service names ("cannot be changed later") and job names ("can't edit the name of the
  job");
- Pub/Sub topics and Artifact Registry repositories, which have no rename either.

Postgres can rename a database in place (`ALTER DATABASE ... RENAME TO`) while nothing is connected
to it. Terraform `moved` blocks change only state addresses, never cloud names.

So the new names are created next to the old ones, traffic moves over, and the old ones are retired
after the rollback window. `OLD` and `NEW` below are the old and new `repo` short forms; work one
environment at a time, starting with `dev`.

## Before you start

- The manifest names the GCP project of every environment under `projects`. A rename keeps the
  project, and `secrets rename-repo` refuses to run without it.
- Pick `NEW` by the naming rule: 3 to 11 characters, lowercase, digits and `-`.

## Steps

1. **Branch and change the manifest.** Set `"repo": "NEW"` in `secrets.manifest.json`. Change the
   stack's Terraform the same way: every `<repo>-<kind>-<env>` name comes from the manifest or one
   variable.
2. **Create the new resources; keep the old ones.** The secrets module keys its resources by
   purpose, so a changed `repo` would replace (delete) each old secret. Take the old ones out of
   Terraform state first, so they stay in GCP unmanaged:

   ```bash
   terraform state rm module.secrets
   terraform apply
   ```

   Do the same for every other resource whose name changes (identities, buckets, topic, services and
   jobs): `terraform state rm` the old address, then apply to create the new one.
3. **Copy the secrets.** `secrets rename-repo OLD NEW --env dev` shows the old to new pairs and
   the manifest diff and changes nothing. Then, in your own terminal:

   ```bash
   secrets rename-repo OLD NEW --env dev --apply
   ```

   It asks for one confirmation, copies the newest enabled version of every `OLD-<purpose>-dev`
   secret into `NEW-<purpose>-dev` and pins it. Generated secrets are not copied: Terraform wrote a
   new value in step 2. Reading the old values needs payload access, which nobody holds standing in
   staging and prod; the command prints the time-bound grant an admin makes.

   Copy bucket contents with a storage transfer job from `OLD-files-<env>` to `NEW-files-<env>`.
4. **Deploy under the new names.** Commit the pins, let CI apply Terraform, and deploy the services
   and jobs under the new names with the new identities. Run `secrets check --env dev`.
5. **Move traffic.** Change the domain mappings or load balancer backends to the new services.
6. **Retire the old resources after the rollback window** (`rollbackWindowDays`). The old secrets
   are no longer in the manifest or in Terraform state, so remove them by hand:

   ```bash
   gcloud secrets delete OLD-PURPOSE-dev --project PROJECT
   ```

   Then delete the old services, jobs, identities, buckets and topic.
7. **Rename the database last**, with `ALTER DATABASE OLD_dev RENAME TO NEW_dev` while nothing is
   connected, or keep its old name and record it as a named exception in the app's docs.

Repeat from step 2 for `staging`, then `prod`.

## Renaming one secret

A secret's purpose can change without a repository rename:

1. Declare the new purpose next to the old one in the manifest, and apply Terraform.
2. `secrets rename OLD NEW --env E` shows the plan; `--apply` copies the newest enabled version and
   pins it. The old secret stays readable during the alias period.
3. Change the app to read the new env var, update Terraform, and roll out.
4. After the rollback window: `secrets retire OLD --env E --all`, later `--destroy --all`, then
   remove the old purpose from the manifest.
