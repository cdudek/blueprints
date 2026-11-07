# Secrets rules for coding agents

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
