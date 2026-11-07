---
name: env-and-secrets
description: How configuration is read, validated and documented, and how secrets are created, rotated and kept away from agents.
read-when: adding an env var, an integration, a secret, a new runtime (worker, job), or touching deploy config.
skip-when: the change reads no configuration and touches no credential.
---

# Env and secrets

Configuration enters the app through one module that validates it at boot. The best secret is none: remove the need before storing anything. What remains (third-party keys, webhook signing secrets) lives in a secret manager, is seeded by a human, and is read only by the runtimes that need it.

## Rules

### Configuration
- **ENV-1: One env module; nothing else reads process env.**
  A single file parses env with a schema (zod in TypeScript) and exports a typed object. Direct env reads elsewhere fail review and a lint rule.
- **ENV-2: Validate at boot, not at build.**
  Required keys are checked when the server starts, so the build stays reproducible and a missing key stops the deploy before traffic. A bad value names the key, never prints the value.
- **ENV-3: One resolver for the public app URL.**
  A single function returns the canonical origin from env, with a documented local fallback. Auth callbacks, emails, sitemaps, canonical tags and OAuth redirects all use it ([security](security.md), [seo](seo.md)).
- **ENV-4: `.env.example` documents every key.**
  Per key: purpose, secret or not, how to generate or where to get it, and what happens when it is absent. Only placeholders, never a real value. A test fails when the env schema and `.env.example` disagree.
- **ENV-5: Optional integrations switch off when their env is empty; required secrets fail closed.**
  Analytics with no token is off. Auth with no signing secret refuses to boot. Never fall back to a default secret.
- **ENV-6: Keep four kinds of setting apart.**
  Reviewed deploy config (in the repo), deploy inputs (per environment), operational controls (flags, see [release-and-deploy](release-and-deploy.md)), and secrets. Namespace variables per service when several share a platform.
- **ENV-7: Public variables are public.**
  Anything exposed to the browser (the framework's public prefix) is non-secret by definition. Review each one.

### Secrets
- **ENV-8: Prefer no secret.**
  Runtimes use an attached service identity. CI uses keyless workload identity federation, not stored service-account keys. The database uses IAM authentication where the platform supports it. Third-party API keys and webhook secrets are what is left.
- **ENV-9: Secret Manager is the source of truth.**
  Not the repository, not encrypted files in git, not CI variables (except a vendor-forced exception, written down with its reason and one job scope). Replicate in the EU ([legal](legal.md)).
- **ENV-10: One secret per consumer and purpose.**
  Do not reuse another app's key under a new name; ownership gets lost. Each secret has an owner and a list of reader runtimes.
- **ENV-11: Readers per runtime.**
  Web, worker and migration job each read only the secrets they declare. A worker-only key is not injected into web. Migration identities have schema rights; runtime identities have data rights only.
- **ENV-12: Inject pinned versions, not "latest".**
  A secret resolved at instance start can differ across instances under `latest`. Pin the version in the deploy config so every rotation is a reviewed change and every rollback is a revert.
- **ENV-13: Agents never read secret values or `.env` files.**
  See [agent-files](agent-files.md). No agent prints the environment, reads a secret version, puts a value on a command line or in a file, log, commit or message, or asks a human to paste one into the chat.

### Lifecycle
- **ENV-14: Follow create, seed, probe, rotate, retire.**
  1. Create the empty secret container in infrastructure code, with readers and labels.
  2. Seed the value out of band: a human types it into a hidden prompt in their own terminal.
  3. Probe it against the vendor's API before it is stored or used. The probe never prints the value or puts it in argv.
  4. Map it into the runtime only after it is seeded. Mapping an unseeded key can break the whole secret set and block startup.
  5. Rotate by adding a new version, pinning it, rolling out every revision, then disabling the older versions.
  6. Retire after the rollback window: destroy disabled versions, or the whole secret once nothing reads it.
- **ENV-15: Define a rollback window and keep old versions until it ends.**
  Default seven days. Disabling is reversible; destroying is not. Rotation needs a restart path, because env vars are fixed when a process starts.
- **ENV-16: Secret sync is not rotation.**
  Copying a new value to a runtime does not rotate it. Rotation is the full sequence in ENV-14, with a reload mechanism on every workload kind.
- **ENV-17: Declare rotation periods and an alert channel.**
  Overdue rotation warns the team. Generated secrets (signing keys) are created by infrastructure code, never typed.
- **ENV-18: Tools that move values never leak them.**
  Turn off shell tracing before touching a value, discard probe output, reject empty values, keep the value byte-exact (trailing newlines included), and pass it on stdin, never as an argument. Validate the manifest: unknown fields rejected, owner and description required, positive rotation and rollback days, generated secrets have a bounded size (for example 16 to 512 bytes) and no probe.

## How to apply

1. Write the env module and `.env.example` together before the first integration.
2. List each secret in a metadata-only manifest or table: name, description, owner, readers, rotation days, probe, generated or not. Never values.
3. Create containers through infrastructure code per environment; a human seeds them.
4. Add a check that compares the manifest, the env schema, the deploy config and the live secret list, and fails on drift.
5. Add deny rules for value-reading commands and `.env` files to the agent settings ([agent-files](agent-files.md)).
6. When adding an env var later: schema, `.env.example`, deploy config, secret manifest if secret, and the check, in one change.

## Checks

- Automated: boot fails on a missing required key; env schema and `.env.example` match; no `process.env` outside the module; drift check across manifest, pins and live secrets; scanners for committed secrets ([ci](ci.md)).
- Automated: tests scrub all live credentials and clear cached settings, independent of any local dotenv.
- Review: no secret in a public variable, a log line, a URL or a client bundle.

## Mistakes to avoid

- Reading env in many files, so a missing key surfaces mid-request.
- Treating "synced to the runtime" as "rotated".
- Mapping a key before it is seeded.
- Leaving secret replication on automatic in a helper script, against the EU rule.
- Long-lived admin keys or a downloaded service-account key used to bootstrap.
- Preview environments that inherit production secrets.
- Scaffold leftovers: env keys for features the product does not have.
