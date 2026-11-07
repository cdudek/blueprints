---
name: ci
description: One verify command, the CI workflows and their hardening, the AI review brief, the PR template, merge rules, and the Make contract of standard target names.
read-when: setting up CI or a Makefile, adding a workflow or scanner, writing REVIEW.md or the PR template, or a check fails or is skipped.
skip-when: you are changing product code and the pipeline already covers it.
---

# CI

The pipeline is the same checks a developer runs locally, run again where nobody can skip them. The idea: one command defines "good", CI runs that command, and every promise in the docs (a review gate, a guard test) is backed by a job that really runs.

## Rules

### One command, one gate

- **CI-1: There is one verify command: format check, lint, slop, typecheck, test.** Local runs and CI call the same command. When it fails, fix the code, not the test or the check.
- **CI-2: Targets follow a fixed contract** (see "Make contract" below), so every repo and every agent uses the same names.
- **CI-3: One required summary check gates the merge.** It depends on all real jobs and fails if any failed or was skipped by mistake. Branch protection requires only that one.
- **CI-4: Docs-only PRs skip code checks** but still run the summary check, so the PR can merge. Detect by changed paths; a mixed PR runs everything.
- **CI-5: Guard tests run in the required job.** A test not in the required job is decoration (see [testing](testing.md)).

### Workflow hygiene

- **CI-6: Least privilege.** Each workflow sets `permissions` to read-only by default and widens per job. Every job has a timeout.
- **CI-7: Checkout uses `persist-credentials: false`.** Jobs that push use a short-lived app token, not the default token.
- **CI-8: Pin every third-party action to a full commit SHA,** with the version as a comment. The dependency bot keeps pins current.
- **CI-9: Cloud access is keyless** through workload identity, never a stored key. Secrets reach a job only if that job needs them. See [env-and-secrets](env-and-secrets.md).
- **CI-10: Scanners run on every PR:** secret scanning, workflow linting, container scanning, and infrastructure-as-code scanning. A dependency update bot opens weekly grouped updates.
- **CI-11: A comment explains each non-obvious step.** Why this flag, why this order, what breaks without it.
- **CI-12: Test the scripts and hooks that CI relies on,** and change them in the same PR as the convention they implement.

### AI review

- **CI-13: An AI reviewer reads the diff against `REVIEW.md`** once per non-bot PR, and again on a re-review label. It reads the diff once and opens a file only when the diff cannot settle a finding.
- **CI-14: `REVIEW.md` defines three passes:** bugs, security (secrets or personal data in logs, missing timeout, swallowed exception, new network egress, widened permission, auth trusting client input), and compliance (the change matches its facts and plan, follows the agent files, and does not make any of them false).
- **CI-15: "Important" means real breakage:** broken behavior, a write to the wrong system, leaked data, or a breached rule no test catches. Style and preference are nits. Report at most five nits and count the rest.
- **CI-16: The reviewer skips what CI already enforces,** and generated files such as lockfiles.
- **CI-17: The review ends with a machine-readable tally line the merge gate reads,** bound to the reviewed commit:

```text
IMPORTANT: <n>  NITS: <m>  SHA: <head sha>
```

- **CI-18: A review gate that docs promise must exist.** If the workflow is off, the docs say so. A "needs owner approval" tier requires a code-owners file and a required-review rule, or it is not called that.

### Pull requests and merge

- **CI-19: The PR template maps each requirement to its proof:** the fact or rule id, the test or screenshot that shows it, and the change folder link.
- **CI-25: The PR template asks the Decision4 question and carries the class fields.** It opens with "If this turns out to be wrong, what does it take to put right?" and requires `Decision-Class` (Undo, Repair, Migrate or Answer) on every PR, `Put-right` at Repair and above, `Answerer` at Migrate and Answer, and `Class-Change` whenever a class was lowered (recommended when raised), in the form `<from> -> <to>; <lowered or raised> by <who>; <why>`.
- **CI-26: A `decision4` check is part of the required summary.** It validates `boundary-map.yaml` against the pinned schema URL (`boundary-map.schema.json` at the Decision4 v1.0.1 tag, see [sources](sources.md)) and checks the PR fields of CI-25: present, a valid class, the conditional fields filled. It also fails when a PR touches ground the map floors higher than the declared class and carries no `Class-Change`.
- **CI-27: Changes to `boundary-map.yaml` need the owner's review.** List it in the code-owners file and require that review. Changing the map is a recorded Repair decision; nothing lowers a class below its floor except a recorded map change.
- **CI-20: Squash merge, with a Conventional Commit title.** The title decides the release type (see [release-and-deploy](release-and-deploy.md)). One change per PR.
- **CI-21: Arm auto-merge on every PR that can merge on green.** Hand a PR to the owner only when it needs a human judgment. Check the merge state (behind, blocked, clean) before saying it is ready; green checks are not the same as mergeable.
- **CI-22: Branch from a freshly fetched default branch,** never from a stale local copy.
- **CI-24: Slop is its own CI job, part of the required check.** It runs the `slop` target: anti-slop lint rules plus the slop metrics compared with the merge base. It fails on its own, so a slop regression is visible as such and cannot hide behind a green test run. It posts the metric deltas on the PR.

### Make contract

- **CI-23: Every repo defines the same standard targets,** named in kebab-case, so one habit works across stacks. A target with nothing to do prints "not applicable" and exits 0.
  - `setup`: install dependencies from the lockfile, install git hooks.
  - `dev`: run the app locally.
  - `lint` and `format`: static checks and auto-fix.
  - `slop`: the anti-slop rules and the slop metrics, its own step and its own CI job (see [code-quality](code-quality.md)).
  - `typecheck`: the type checker over all source.
  - `test` and `test-integration`: fast tests; tests needing a database or browser.
  - `arch`: boundary and import rules (see [structure](structure.md)).
  - `check`: everything CI runs, in order. This is the verify command of CI-1.
  - `migrate`: apply migrations. `docker-build`: build the image.
  - `help` is the default goal and lists every target with its one-line description.
  Each stack maps these names to its own tools; the names stay fixed. Agent files name these targets, not raw tool commands.

```make
check: format-check lint slop typecheck test test-integration arch  ## everything CI runs
```

## How to apply

1. Create the Makefile with the standard targets and `check` before any other code, so the first PR already runs CI.
2. Write the CI workflow: one job per concern, a required summary job, path filter for docs-only, pinned actions, permissions and timeouts.
3. Add scanners and the update bot. Add the `decision4` check and list `boundary-map.yaml` in the code-owners file. Add `REVIEW.md` and the review workflow. Add the PR template with the Decision4 question and fields.
4. Configure the repo: squash merge only, Conventional Commit title check, auto-merge on, one required check.
5. Later: a new guard test or script is added to `check` and to the required job in the same PR.

## Checks

- Automatic: a test or script confirms every `uses:` is a SHA, every job has a timeout, every workflow declares permissions, and the summary job needs all other jobs.
- Automatic: the `decision4` check (CI-26) passes; the code-owners file lists `boundary-map.yaml`.
- Automatic: every target in the Make contract exists; commands named in agent files exist.
- Review: whether a workflow change widens permissions, whether `REVIEW.md` still matches the rules.

## Mistakes to avoid

- A review gate documented but disabled in the workflow config, with no code owners file.
- Verify command named in docs that did not exist.
- Required job that skipped the guard tests, so rules regressed silently.
- Floating action tags that changed under the pipeline.
- A step timeout raised to hide a slow build instead of finding the cause.
- A "green" PR handed over while it was behind the default branch and could not merge.
- A tally line not tied to a commit, so a stale review passed a later push.
- A PR template with a Decision-Class field nobody validated, so every PR said Undo.
- A map edited in a feature PR by the author, lowering the floor of the ground it changed.
