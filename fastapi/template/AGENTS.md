# Notes for coding agents

This service follows a modular monolith whose modules are entered only through doors. Read
`ARCHITECTURE.md` (in the blueprint repository; copy it into `docs/` when you adopt the template)
before adding code. `.importlinter` and `tests/architecture/` enforce it; `make check` is the full
gate and `make help` lists every target.

## Where new code goes

- **A business capability:** `src/app/modules/<plural>/` with `__init__.py` (the door: imports and
  `__all__` only), `service.py`, `repository.py`, `rules.py`, `schemas.py`, `models.py`,
  `errors.py`. Add `router.py`, `system.py` or `jobs.py` only when the module needs that role.
  List every new file in the module's door contract in `.importlinter`, the table owner in
  `tests/architecture/test_reflection_rules.py`, and import its models in `src/app/schema.py`.
- **An operation:** a plain function in `service.py`, decorated with `@operation(access=...)`,
  taking `tx: Tx` first and, for a user operation, the caller's `Principal`. It never opens,
  commits or rolls back a transaction.
- **An HTTP route:** the module's `router.py`, mounted in `src/app/api/mount.py`. It opens one
  `async with in_transaction() as tx:`, calls one operation and depends on `CurrentUser`.
- **A process across modules:** `src/app/workflows/<name>.py`, which owns its transaction. Its
  docstring answers: retry-safe? duplicates? recovery? survives a restart?
- **Background work:** a task in the module's `jobs.py`, deferred with `defer_in(tx, ...)` in the
  caller's transaction. No external call inside a transaction: claim, commit, call, record.
  `docs/worked-slice.md` is the reference.
- **Pure decisions:** `rules.py`. No database, clock, randomness or environment: pass them in.
- **A third-party service:** `src/app/clients/<name>/` with `base.py` (a Protocol), `factory.py`
  and `providers/{real,fixture,noop}.py`. Tests use the fixture provider.
- **A setting:** a field on `Settings` (`src/app/config/settings.py`) and its name in
  `.env.example`. A secret is a `SecretStr` and is declared in `secrets.manifest.json`.
- **A schema change:** `make migration name=...`, then review it. Set `PHASE`; an `expand`
  migration only adds. Raw SQL needs a `# reviewed: <reason>` comment on the line above.

## Before you finish

Run `make check`. Never add a `noqa`, a type ignore or a per-file ignore to get it green: fix the
code. A ratchet fails on every new suppression.

## Secrets rules for coding agents

These rules hold for any coding agent working in this repository. They guard against accidents. The
real boundary is credentials: an agent session runs with no cloud credentials, or with a separate
gcloud config (`CLOUDSDK_CONFIG`) whose identity holds only `roles/secretmanager.viewer`. Code that
runs with a secret can read it, so real values are used only in a context the agent cannot steer.

**An agent may:**

- run `make secret-list` and `make secret-check`;
- run `make secret-rename` and `make secret-rename-repo` without `APPLY=1` (dry runs);
- open the pull request with a `secret-versions/<env>.json` change the CLI prepared.

**An agent asks a human to run, in the human's own terminal:**

- `make secret-set`, `make secret-rotate` and `make secret-retire`;
- either rename with `APPLY=1`;
- `make dev-real`.

The human types the value into a hidden prompt. A hidden prompt needs a terminal, which an agent's
shell does not have, so `set` stops safely there.

**An agent never:**

- reads a secret value (`gcloud secrets versions access`), prints the environment (`env`,
  `printenv`) or reads `.env` files other than `.env.example`;
- puts a value in a command line, a file, a log, a commit or a message;
- asks a human to paste a value into the conversation.

`.claude/settings.json` carries the same rules for Claude Code (merge
`tools/common/agents/claude-settings.json` into it), with the sandbox on for the paths that deny
rules cannot cover in subprocesses. `secrets check` reports any deny rule that is missing.
