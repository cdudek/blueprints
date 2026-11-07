# common

The stack-agnostic parts every blueprint vendors: a secrets CLI, the Terraform module that creates
the secret containers and their access, a Make contract and the naming conventions. It has no
template and no architecture, which is what sets it apart from a blueprint.

GCP is the only backend in 1.0.0. Every cloud call in the CLI sits behind one `backend_*` function
set (`secrets/backends/gcp.bash`), so a second backend is one more file.

| Part | Path |
| --- | --- |
| Secrets CLI | [`secrets/secrets`](./secrets/secrets) |
| Manifest schema | [`secrets/manifest.schema.json`](./secrets/manifest.schema.json) |
| Terraform module | [`terraform/secrets/`](./terraform/secrets) |
| Make contract | [`make/common.mk`](./make/common.mk), [`make/secrets.mk`](./make/secrets.mk) |
| Agent rules | [`agents/claude-settings.json`](./agents/claude-settings.json), [`agents/AGENTS.md`](./agents/AGENTS.md) |
| Repository rename runbook | [`docs/rename-repo.md`](./docs/rename-repo.md) |

## The best secret is none

Before anything is stored, remove the need for it. Every item below is keyless on GCP:

- **Service identities** for every runtime (web, worker, migrate, extra services). Google APIs are
  reached through the attached identity and Application Default Credentials, never a key file.
- **CI through Workload Identity Federation** (`google-github-actions/auth@v3`,
  `id-token: write`): no service-account keys in CI.
- **The database through Cloud SQL IAM authentication.** A connector authenticates the runtime
  identity with a short-lived OAuth token, so there is no database password. The Auth Proxy and the
  Go, Java and Python connectors support it; the Python connector supports `psycopg` with
  `enable_iam_auth=True`. The instance needs the `cloudsql.iam_authentication` flag, and IAM login
  works over TLS only.

What remains are third-party API keys and webhook signing secrets. The CLI and the Terraform module
exist only for these.

### Why not encrypted files in the repository

sops, git-crypt and dotenvx keep ciphertext in the repository and its history, so revoking a person
means rotating everything they could decrypt. git-crypt states that it "does not support revoking
access" and has "no support for rotating the key". dotenvx keeps its private key in `.env.keys` or
`DOTENV_PRIVATE_KEY`, which is plaintext-equivalent to anyone, or any agent, who can read the
working tree.

Encrypted files are fine for GitOps (a controller decrypts at deploy) and for small teams using
sops with a cloud KMS key that no developer or agent machine holds, for rarely changing config. They
are not fine with git-crypt, shared age or PGP keys, dotenvx with its private key in the working
tree, often-rotated credentials, or when every read must be audited. `common` uses Secret Manager as
the source of truth and ships no encrypted-file tooling.

## Naming

**One rule for every cloud resource: `<repo>-<kind>-<env>`.** The environment is always in the
name, even though each environment also gets its own GCP project. Explicit names survive
cross-project IAM grants, logs, billing exports and copy-paste mistakes.

**`<repo>`** is the repository name in lowercase, with `_` and `.` turned into `-`, 3 to 11
characters.

- The limit comes from service accounts, whose ID must be 6 to 30 characters of lowercase letters,
  digits and dashes. The longest identity name is a 10-character kind plus `staging` plus 2 dashes,
  which leaves 11 characters for the repo.
- A longer repository name gets a fixed short form, declared once in the manifest as `repo` and used
  everywhere, never only where a name overflows. `shop-platform-backend` becomes `shop-backend`,
  still too long, so it becomes `shop`.

**`<env>`** is `dev`, `staging` or `prod`, the only allowed spellings, plus `pr-<n>` (n up to 4
digits) for previews.

**`<kind>`** comes from this vocabulary. Kinds that name a service account are at most 10
characters.

| Kind | Names | Example (`shop`, `prod`) |
| --- | --- | --- |
| `web` | Cloud Run web service and its service account | `shop-web-prod` |
| `worker` | Cloud Run worker (service or worker pool) and its service account | `shop-worker-prod` |
| `migrate` | Cloud Run migration job and its service account | `shop-migrate-prod` |
| `<service>` | an extra runtime under `services/<name>/`: Cloud Run service and its service account | `shop-transcribe-prod` |
| `ci` | CI identity: build, push images, read secret metadata | `shop-ci-prod` |
| `deploy` | deploy identity: new revisions, run the migrate job; no secret access | `shop-deploy-prod` |
| `images` | Artifact Registry repository | `shop-images-prod` |
| `files` | Cloud Storage bucket for app files | `shop-files-prod` |
| `tfstate` | Cloud Storage bucket for Terraform state | `shop-tfstate-prod` |
| `sql` | Cloud SQL instance | `shop-sql-prod` |
| `db` | Postgres database, with underscores: `<repo>_<env>` | `shop_prod` |
| `secrets-rotation` | Pub/Sub topic for rotation notices | `shop-secrets-rotation-prod` |

`db` uses underscores because unquoted Postgres identifiers allow letters, digits, `_` and `$` but
not `-`; a hyphenated name must be quoted everywhere it appears. The maximum is 63 bytes.

**Secrets: `<repo>-<purpose>-<env>`**, for example `shop-payments-api-key-prod`.

- `<purpose>` is lowercase kebab-case, names the vendor and the use, and never repeats the repo or
  the environment. Secret Manager allows letters, digits, `-` and `_`, up to 255 characters.
- **Environment variable:** `<purpose>` in UPPER_SNAKE (`-` becomes `_`), so `PAYMENTS_API_KEY`. The
  environment is not in the variable name, because each environment injects its own value. A
  mounted secret file uses the same name as the variable.

**Settings field per stack.** One config module per app reads the variable name above:

- **Python:** a pydantic-settings field `payments_api_key: SecretStr`, with no `env_prefix`.
- **TypeScript:** a key `PAYMENTS_API_KEY` in the zod env schema, exposed as `paymentsApiKey`.
- **Rust:** a struct field `payments_api_key`, read by `envy` or `config` without a prefix, wrapped
  in `secrecy::SecretString`.
- **Kotlin:** a config data class property `paymentsApiKey`, bound explicitly to
  `PAYMENTS_API_KEY` in the config module.
- **Scala:** a config case-class field `paymentsApiKey`, bound with a HOCON `${?PAYMENTS_API_KEY}`
  substitution.

**Other names:**

- **Labels on every resource:** `app=<repo>`, `env=<env>`, `role=<kind>`, `owner=<team>`. Label keys
  are 1 to 63 characters and start with a lowercase letter; values are 0 to 63 characters; both use
  lowercase letters, digits, `_` and `-`; at most 64 labels.
- **Terraform:** local names and module call names are snake_case and name the kind
  (`google_cloud_run_v2_service.web`). The environment comes from a variable, never from an address.
- **Make targets:** kebab-case. The standard names are fixed (see the Make contract). New targets
  put the family first (`secret-set`, `docker-build`, `test-integration`), so `help` groups them.
- **Globally unique names:** buckets share one global namespace and are 3 to 63 characters. If
  `<repo>-<kind>-<env>` is taken, append the project number.

**Limits checked:** Cloud Run service names are 49 characters or less; Pub/Sub IDs are 3 to 255
characters, start with a letter and never start with `goog`. Every `<repo>-<kind>-<env>` name is at
most 30 characters by construction, except the rotation topic (at most 36), which keeps all of them
inside these limits.

**The regexes `secrets check` enforces** (bash 3.2 `[[ =~ ]]`, ERE):

```text
env      ^(dev|staging|prod|pr-[0-9]{1,4})$
repo     ^[a-z][a-z0-9-]{1,9}[a-z0-9]$
kind     ^(web|worker|migrate|ci|deploy|images|files|tfstate|sql|secrets-rotation|[a-z][a-z0-9-]{0,8}[a-z0-9])$
resource ^<repo>-<kind>-<env>$          service-account names also <= 30 characters
secret   ^<repo>-[a-z][a-z0-9]*(-[a-z0-9]+)*-<env>$
envvar   derived: purpose with - to _ and upper-cased; must match ^[A-Z][A-Z0-9_]*$
db       ^<repo with - to _>_<env with - to _>$
```

**Worked example, `shop`:**

| Resource | dev | staging | prod |
| --- | --- | --- | --- |
| GCP project (recommended) | `shop-dev` | `shop-staging` | `shop-prod` |
| Web service and identity | `shop-web-dev` | `shop-web-staging` | `shop-web-prod` |
| Worker and identity | `shop-worker-dev` | `shop-worker-staging` | `shop-worker-prod` |
| Migrate job and identity | `shop-migrate-dev` | `shop-migrate-staging` | `shop-migrate-prod` |
| Extra service | `shop-transcribe-dev` | `shop-transcribe-staging` | `shop-transcribe-prod` |
| Images, files | `shop-images-dev`, `shop-files-dev` | `shop-images-staging`, `shop-files-staging` | `shop-images-prod`, `shop-files-prod` |
| Database | `shop_dev` | `shop_staging` | `shop_prod` |
| Secret, and its env var | `shop-payments-api-key-dev`, `PAYMENTS_API_KEY` | `shop-payments-api-key-staging`, `PAYMENTS_API_KEY` | `shop-payments-api-key-prod`, `PAYMENTS_API_KEY` |
| Rotation topic | `shop-secrets-rotation-dev` | `shop-secrets-rotation-staging` | `shop-secrets-rotation-prod` |

Project IDs are globally unique. If `shop-prod` is taken, add a suffix to the project only and
record it under `projects` in the manifest; resource names do not change.

**A repository rename is a migration, not a rename.** Secret names, service account IDs, bucket
names, Cloud Run service and job names are fixed at creation. Terraform `moved` blocks change only
state addresses, never cloud names. [`docs/rename-repo.md`](./docs/rename-repo.md) is the runbook.

## How a project gets it

Copy `common/` into the app repository as `tools/common/`, with its `VERSION` file. Nothing is
fetched over the network at run time.

```bash
cp -R common my-app/tools/common
```

An upgrade replaces the folder and follows [`CHANGELOG.md`](./CHANGELOG.md). `secrets check` warns
when `tools/common` is older than the manifest's `schemaVersion` supports.
