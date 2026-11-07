---
name: naming
description: Names for the repo, app, environments, secrets, cloud resources and labels, and how to rename a repository safely.
read-when: creating a repo, app or cloud resource, declaring a secret, writing infrastructure code, or renaming anything.
skip-when: the change adds no named resource.
---

# Naming

Name every cloud resource `<slug>-<kind>-<env>`. The environment is always in the name, even when each environment has its own project. Explicit names survive cross-project permissions, logs, billing exports and copy-paste mistakes. Cloud names are fixed at creation, so choose once.

## Rules

### Slugs and environments
- **NAME-1: One durable app slug.**
  Lowercase, digits and `-`, 3 to 11 characters, derived from the repo name (`_` and `.` become `-`). The same slug names namespaces, resource prefixes, service accounts, the image repository and secrets.
- **NAME-2: Short names are declared once.**
  If the repo name is too long, pick one short form, record it in the repo's docs, and use it everywhere, not only where a name overflows. The 11-character cap leaves room for service-account IDs (6 to 30 characters).
- **NAME-3: Environment suffixes are `-dev`, `-staging`, `-prod`, and `-shared` for resources used by all environments.**
  No other spellings (`production`, `stg`). Previews use `pr-<n>` and are off until they have their own hostname, secrets, identity and jobs.

### Resources
- **NAME-4: Resource pattern is `<slug>-<kind>-<env>`.**
  Kinds come from a small vocabulary: `web`, `worker`, `migrate`, a named extra service, `ci`, `deploy`, `images`, `files`, `tfstate`, `sql`, `secrets-rotation`. Examples for slug `shop`: `shop-web-prod`, `shop-images-staging`, `shop-sql-prod`.
- **NAME-5: Keep identity names within limits.**
  Service-account kinds are at most 10 characters so the full name stays within 30. Check platform limits for services and buckets (buckets are globally unique; if taken, append the project number).
- **NAME-6: Database names use underscores: `<slug>_<env>`.**
  Unquoted Postgres identifiers cannot contain `-`.
- **NAME-7: Secret names are `<slug>-<purpose>-<env>`.**
  The purpose is lowercase kebab-case, names the vendor and use, and never repeats the slug or env (`shop-payments-api-key-prod`).
- **NAME-8: Env var names derive from the purpose.**
  Upper snake case, env not included (`PAYMENTS_API_KEY`), because each environment injects its own value. The settings field in code is the camelCase of the same name. See [env-and-secrets](env-and-secrets.md).
- **NAME-9: Every resource carries labels.**
  `app=<slug>`, `env=<env>`, `role=<kind>`, `owner=<team>`. Lowercase letters, digits, `_` and `-`; keys start with a letter; values up to 63 characters.
- **NAME-10: Infrastructure code names are snake_case and describe the kind.**
  The environment comes from a variable, never from a resource address. Make or script targets are kebab-case with the family first (`secret-set`, `docker-build`).

### Renaming
- **NAME-11: A repository rename is a migration, not a rename.**
  Secrets, service-account IDs, buckets, services, jobs, topics and image repositories cannot be renamed in place. Create the new names beside the old, move traffic, retire the old after the rollback window.

## How to apply

### New product
1. Choose the slug and write it, with the kind vocabulary, in [decisions](decisions.md) or the repo docs.
2. Create projects and resources with the pattern above. Check generated names against a validation test (regexes for env, slug, resource, secret, env var).
3. Add the labels in the shared infrastructure module so no resource is created without them.

### Rename the repository (general steps)
Work one environment at a time, starting with dev.
1. Confirm which cloud project each environment uses. A rename keeps the project. Pick the new slug by NAME-1.
2. On a branch, change the slug in the manifest or variable that every name comes from.
3. Create the new resources next to the old ones. Remove the old ones from infrastructure state (do not destroy them) so the apply cannot delete them. State moves change addresses only, never cloud names.
4. Copy secrets: for each old secret, copy its newest enabled version into the new name and pin it. Generated secrets are made fresh. A human or an opaque transfer job does the copy; no agent reads the values (ENV-13).
5. Copy bucket contents with a transfer job. Copy or rebuild images under the new repository.
6. Deploy services and jobs under the new names and identities. Run the drift check.
7. Move traffic: change domain mappings or load balancer backends. Grep every internal caller of a renamed service first (jobs, probes, schedulers).
8. After the rollback window, delete the old secrets, services, jobs, identities, buckets and topics by hand.
9. Rename the database last (`ALTER DATABASE ... RENAME TO` while nothing is connected), or keep the old name and record it as a named exception.
10. Repeat for staging, then prod.

A single secret can change purpose without a repo rename: declare the new purpose beside the old, copy and pin, switch the app to the new env var, then retire the old after the rollback window.

## Checks

- Automated: a validation test of every declared name against the patterns; a drift check between declared and live resource names; a lint that flags a resource without the four labels.
- Review: no hard-coded environment in a resource address; slug used consistently.

## Mistakes to avoid

- Renaming in infrastructure code and letting the plan destroy and recreate secrets or buckets.
- Using `production` in one place and `prod` in another.
- Putting the environment in an env var name, so one config cannot move between environments.
- Reusing one app's secret container for another app.
- Hyphenated database names that need quoting everywhere.
- Renaming a service without grepping the jobs and probes that call it.
