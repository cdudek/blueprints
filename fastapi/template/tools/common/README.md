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

## Terraform module: `terraform/secrets/`

Terraform 1.11 or later (write-only arguments) and the Google provider 8.x.

```hcl
module "secrets" {
  source = "../tools/common/terraform/secrets"

  manifest_path  = "${path.root}/../secrets.manifest.json"
  env            = var.env
  project        = var.project
  project_number = var.project_number
  human_group    = "secrets-admins@example.com"
}
```

It reads the manifest and `secret-versions/<env>.json` beside it, and creates:

- **One secret per declared purpose:** `<repo>-<purpose>-<env>`, automatic replication, the labels
  `app`, `env`, `role=secret` and `owner`, and `version_destroy_ttl` set to the rollback window, so a
  destroyed version stays recoverable that long.
- **Rotation notices** for secrets with `rotationDays`: a `<repo>-secrets-rotation-<env>` topic,
  publish rights for the Secret Manager service agent, and `rotation_period` with a first
  `next_rotation_time` that later plans ignore. Secret Manager rotates nothing itself; it publishes
  a `SECRET_ROTATE` message for the team's alert channel. Create the service agent once per project:
  `gcloud beta services identity create --service secretmanager.googleapis.com --project PROJECT`.
- **IAM per secret:** `secretAccessor` for each reader's `<repo>-<kind>-<env>` service account;
  `secretVersionManager` and `viewer` for the human group (no payload access); `viewer` for
  `<repo>-ci-<env>`; and `secretAccessor` for the human group in `dev` only, on `local` secrets.
- **Generated values, and no others.** An ephemeral `random_password` feeds `secret_data_wo`, which
  is never stored in plan or state. `secret_data_wo_version` is the generation in
  `secret-versions/<env>.json`; `secrets rotate` bumps it. The old version is abandoned, not
  deleted, so running revisions keep working until `secrets retire`.

The output `env_vars` maps each env var name to `{secret, version, readers}`; a secret with no pin is
left out, so the app fails closed. [`examples/cloud-run/`](./terraform/secrets/examples/cloud-run)
wires a web service, a worker and a migrate job to it. `project_number` is an input rather than a
data source so the module plans without credentials.

## The manifest: `secrets.manifest.json`

It lives at the root of each app repository and holds metadata only, never values. JSON, because
`jq` and Terraform's `jsondecode` both read it natively. [`manifest.schema.json`](./secrets/manifest.schema.json)
gives editors completion; `secrets check` is the authoritative validation.

```json
{
  "$schema": "tools/common/secrets/manifest.schema.json",
  "schemaVersion": 1,
  "repo": "shop",
  "envs": ["dev", "staging", "prod"],
  "projects": { "prod": "shop-prod-4821" },
  "rollbackWindowDays": 7,
  "secrets": {
    "payments-api-key": {
      "description": "Payments provider secret key, used for charges and refunds",
      "owner": "billing",
      "readers": ["web", "worker"],
      "local": true,
      "rotationDays": 90,
      "probe": "probes/payments-api-key.sh"
    },
    "session-signing-key": {
      "description": "Signs session cookies",
      "owner": "platform",
      "readers": ["web"],
      "generated": { "bytes": 32 }
    }
  }
}
```

- **`readers`:** the kinds whose `<repo>-<kind>-<env>` service accounts get `secretAccessor`.
- **`local`:** `dev-env` may fetch the value from `dev`.
- **`probe`:** an executable that reads the value on stdin, checks it against the vendor API and
  exits 0 or 1. It never prints the value or puts it in argv: use `curl --config -` or `-H @-`,
  never `-u "$value"`, and no here-strings (bash 3.2 writes them to a temp file).
- **`generated`:** Terraform generates the value.
- **`ci` and `ciReason`:** a value a vendor forces into CI with no OIDC alternative. `check` lists
  every such exception.
- **`projects`:** the GCP project per environment, when it is not `<repo>-<env>`. A repository
  rename needs it.

Pinned versions live beside the manifest in `secret-versions/<env>.json`
(`{"payments-api-key": "3"}`). Only the CLI writes them, and Terraform reads them.

## Secrets CLI: `secrets/secrets`

One bash script for bash 3.2 or later, with `gcloud` and `jq` 1.6+ as its only dependencies. Its
output is names, version numbers, dates and states, never values.

| Command | Who runs it | What it does |
| --- | --- | --- |
| `list [--env E]` | anyone, agents included | per secret: enabled versions with dates, the pin, readers from the IAM policy |
| `check [--env E]` | anyone, agents included | drift between the manifest, pins, Secret Manager, Cloud Run and the agent rules; non-zero on drift |
| `env-names` | anyone | the env var names, one per line, for a stack's drift test |
| `set NAME --env E [--stdin] [--disable-previous]` | a human | reads a hidden prompt, runs the probe, adds a version on stdin, writes the pin |
| `rotate NAME --env E` | a human | first run: `set`; after the rollout: disables the older versions |
| `retire NAME --env E [--destroy] [--all]` | a human | disables versions older than the live one once it is past the rollback window; `--destroy` destroys them; `--all` retires a secret nothing reads |
| `rename OLD NEW --env E [--apply]` | dry run: anyone; `--apply`: a human | copies OLD's newest enabled version into the declared NEW and pins it; OLD stays until `retire` |
| `rename-repo OLD_REPO NEW_REPO --env E [--apply]` | dry run: anyone; `--apply`: a human | the same for every `<old>-...-<env>` secret, after one confirmation |
| `dev-env -- CMD...` | a human | exports each `local` secret from `dev`, then runs CMD; nothing is written to disk |

**`check` reports drift** (exit 1): an invalid manifest or name; a declared secret that is missing,
has no enabled version or no pin; a pin that does not exist or is not enabled; a live Cloud Run
revision that reads another version than the pin, or `latest`; a secret nobody declared; a live
resource name that breaks `<repo>-<kind>-<env>`; a missing agent rule. It **warns** on overdue
rotation, enabled versions past the rollback window, newer versions not rolled out, and CI
exceptions.

**Updates reach apps through pinned versions, not `latest`.** Cloud Run resolves secrets at instance
start; with `latest`, one revision would run with mixed values as instances scale. Pinning makes
every rotation a reviewed change and every rollback a revert, at the cost of one commit, which the
CLI prepares. A rotation:

1. `make secret-rotate NAME=payments-api-key ENV=prod` adds and pins the new version.
2. Commit `secret-versions/prod.json`; CI applies Terraform, which rolls out new revisions.
3. `make secret-rotate ...` again: once every revision reads the pin, the older versions are
   disabled. Disabling is reversible.
4. After the rollback window: `make secret-retire NAME=payments-api-key ENV=prod DESTROY=1`.

Cloud Run listings use gcloud's own region setting (`CLOUDSDK_RUN_REGION`) when one is needed.

## Make contract: `make/`

`common.mk` sets the shell flags, `--warn-undefined-variables --no-builtin-rules`, `ENV ?= dev` and a
`help` default goal that lists every `## description`. `secrets.mk` adds `secret-list`,
`secret-check`, `secret-set`, `secret-rotate`, `secret-retire`, `secret-rename`,
`secret-rename-repo` and `dev-real`, each one line calling the CLI with `NAME`, `OLD`, `NEW`, `ENV`,
`APPLY`, `DESTROY` and `ALL`.

```make
include tools/common/make/common.mk tools/common/make/secrets.mk

DEV_CMD := uv run fastapi dev
```

Every repository defines the same standard targets; one with nothing to do prints "not applicable"
and exits 0.

| Target | Next.js | FastAPI |
| --- | --- | --- |
| `setup` | `pnpm install --frozen-lockfile` | `uv sync --locked`, `prek install` |
| `dev` | `pnpm dev` | `uv run fastapi dev` |
| `lint`, `format` | `pnpm lint`, `pnpm format` | `ruff check`, `ruff format` |
| `typecheck` | `pnpm typecheck` | `mypy` |
| `test`, `test-integration` | `pnpm test`, `pnpm e2e` | `pytest tests/unit`, `pytest tests/integration` |
| `arch` | `pnpm arch && pnpm arch:baseline` | `lint-imports` plus `tests/architecture` |
| `check` | `pnpm check` | all of the above plus the FastAPI drift tests |
| `migrate`, `run-worker` | `pnpm db:migrate`, the worker entry | `alembic upgrade head`, `procrastinate worker` |
| `docker-build` | `docker build` per target | `docker build` per target |

Other stacks map the same names: Rust with `cargo fmt`, `cargo clippy -D warnings`, `cargo test`
and `cargo deny check`; Kotlin with `./gradlew ktlintCheck detekt test` and ArchUnit for `arch`;
Scala with `sbt scalafmtCheckAll scalafixAll test`.

macOS ships GNU Make 3.81, which ignores `.SHELLFLAGS`; recipes still run in bash there.

## AI agents and CI

- **Agents may** run `make secret-list`, `make secret-check`, and the renames without `APPLY=1`,
  and open the pull request with a pin file the CLI prepared.
- **Agents ask a human** for `secret-set`, `secret-rotate`, `secret-retire`, renames with `APPLY=1`
  and `dev-real`. The value goes into a hidden prompt, which needs a terminal an agent's shell does
  not have.
- **The boundary is credentials, not rules.** An agent session runs with no gcloud credentials, or
  with a separate gcloud config (`CLOUDSDK_CONFIG`) whose identity holds only
  `secretmanager.viewer`.
- **Accident guards:** merge [`agents/claude-settings.json`](./agents/claude-settings.json) into the
  app's `.claude/settings.json` (deny rules for value-reading commands and `.env` files, and the
  sandbox for subprocesses, which deny rules do not cover). [`agents/AGENTS.md`](./agents/AGENTS.md)
  states the same in tool-neutral words. `secrets check` reports a missing rule.
- **CI** authenticates through Workload Identity Federation as `<repo>-ci-<env>` (build, push,
  `secret-check` with viewer) and `<repo>-deploy-<env>` (Terraform apply, new revisions). Neither
  reads payloads. Deploys reference secrets by name and pinned version through Terraform, and CI
  variables hold no secret values except the manifest's `ci` exceptions, each scoped to the one job
  that needs it.
