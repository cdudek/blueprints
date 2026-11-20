---
name: ci
description: One verify command, the CI workflows and their hardening, the review brief, the PR template, merge rules, and the Make contract of standard target names.
read-when: setting up CI or a Makefile, adding a workflow or scanner, writing REVIEW.md or the PR template, or a check fails or is skipped.
skip-when: you are changing product code and the pipeline already covers it.
---

# CI

One command defines "good". You run it locally for free, and GitHub Actions runs the same command once per ready pull request. Pushes are never gated. A draft pull request costs no Actions minutes. One required check, `ci`, gates the merge.

## Rules

### One command, one gate

- **CI-1: There is one verify command: format check, lint, slop, typecheck, test.** `scripts/ci-local` calls this command. Locally it runs every check; in Actions, `scripts/ci-local --ci` runs every check except `LOCAL_ONLY_CHECKS`. When it fails, fix the code, not the test or the check.
- **CI-2: Targets follow a fixed contract** (see "Make contract" below), so every repo and every agent uses the same names.
- **CI-3: One required check gates the merge: `ci`.** It is the aggregate job of `.github/workflows/ci.yml` ([template](ci.yml)); rulesets require it on the default branch and protected interior branches. Do not require `local-ci`; it is retired. Decision4 is never a job, workflow or check (CI-26). The workflow runs only on `pull_request` (opened, synchronize, reopened, ready_for_review), every job skips drafts, one concurrency group per PR cancels the older run, and nothing runs on push to the default branch. A repository still migrating may keep its existing required remote check until `ci` is applied and verified (CI-30).
- **CI-4: Select checks from the changed stacks.** A nonempty diff containing only Markdown or plain-text documents runs format and local link checks; a mixed, code, unknown-path or empty diff runs the full gate. A file under `docs/` or `changes/` is not automatically documentation. The canonical runner is [ci-local.sh](ci-local.sh); its positive, mixed and refusal fixtures run with `python3 -m unittest discover -s core/tests -v`. Copy the runner byte-for-byte after `# END REPO CONFIG`; configure `CHECK_NAMES`, `CHECK_COMMANDS`, `CHECK_TOOLS` and `LOCAL_ONLY_CHECKS` only above that line. `LOCAL_ONLY_CHECKS` names the heavy or costly checks (e2e, docker builds and scans, the macOS runtime build) that you run with a plain `scripts/ci-local` and that Actions skips.
- **CI-5: Guard tests run in the required local gate.** A test not in the required local gate is decoration (see [testing](testing.md)).

### Workflow hygiene

- **CI-6: Least privilege.** Each workflow sets `permissions` to read-only by default and widens per job. Every job has a timeout.
- **CI-7: Checkout uses `persist-credentials: false`.** Jobs that push use a short-lived app token, not the default token.
- **CI-8: Pin every third-party action to a full commit SHA,** with the version as a comment. The dependency bot keeps pins current.
- **CI-9: Cloud access is keyless** through workload identity, never a stored key. Secrets reach a job only if that job needs them. See [env-and-secrets](env-and-secrets.md).
- **CI-10: Scanners run in the local gate:** secret scanning, workflow linting, container scanning and infrastructure-as-code scanning where applicable. Cloud image publication scans the image it publishes too. Dependency updates follow CI-40. Use local/CI image scanners such as Trivy; enabling paid Google registry scanning needs the separate opt-in of [release-and-deploy REL-19](release-and-deploy.md).
- **CI-11: A comment explains each non-obvious step.** Why this flag, why this order, what breaks without it.
- **CI-12: Test the scripts and hooks that CI relies on,** and change them in the same PR as the convention they implement.

### Review brief

- **CI-13: There is no AI review in the gate.** `scripts/ci-local` and `ci.yml` call no model, so the runner needs no authenticated CLI and no PR body. `REVIEW.md` stays the brief for whoever reviews, a person or an agent, outside the gate.
- **CI-14: `REVIEW.md` defines three passes:** bugs, security (secrets or personal data in logs, missing timeout, swallowed exception, new network egress, widened permission, auth trusting client input), and compliance (the change matches its facts and plan, follows the agent files, and does not make any of them false).
- **CI-15: "Important" means real breakage:** broken behavior, a write to the wrong system, leaked data, or a breached rule no test catches. Style and preference are nits. Report at most five nits and count the rest.
- **CI-18: A "needs owner approval" tier requires a code-owners file and a required-review rule, or it is not called that.** A suspended or skipped workflow never counts as review evidence.

- **CI-32: A review also asks CUPID questions,** inside the same review, not as a second pass. Is the change composable (small, with a clear interface)? Does it add a hidden dependency? Does it have a surprising side effect? Does it follow the idiom of the code around it? Does it use the domain vocabulary (see [code-quality](code-quality.md))? Findings use the same severity tally. No scores.

### Enforcement audit

- **CI-30: Every rule that claims a check has an enforcement row.** Per rule: the checker, what invokes it (hook or job), whether its status is required, and the last run with evidence. Installed, configured, executed and passed are four separate states. A check that is not required, or never ran, means the rule is unenforced and the docs say so (CI-18). A ruleset or required check that needs a manual apply leaves a new gate optional until someone applies it, so the audit lists "applied" too.
- **CI-31: A monthly harness audit runs independently of the pipeline.** Each rule's check is exercised on its own, so one failing check cannot hide another, and the result is compared with the enforcement rows of CI-30. Gaps become findings with an owner.

### Monthly local harness audit

- **Operation:** An agent runs `scripts/harness-audit --issue` on the owner's Mac once each month in every adopting repository. Keep this reminder in that repository's engineering docs; use no Actions schedule, cron or launchd job.
- **Shared source:** The executable and legacy fixture adapters belong to `core/references/harness-audit.py`, `legacy-guards-test.py` and `sync-harness-audit.py` in this repository. Consumers sync immutable source pins and hashes with repository-owned command and owner manifests.
- **Adoption:** From a clean blueprint checkout, run `python3 core/references/sync-harness-audit.py <consumer-worktree> --pin <merged-source-sha>`; inspect the dry run, then add `--write`. Commit the two copied executables and `.harness-audit.lock`.
- **Manifest:** `.harness-audit.json` declares an explicit GitHub owner, default branch, actual local check IDs, tool version probes, configuration paths, claimed rules and legacy caller/fixture evidence. Optional repository binding and protected refs keep platform proof explicit.
- **Gate wiring:** Run `python3 scripts/legacy-guards-test.py` and `python3 scripts/harness-audit --verify-config` as cheap checks in the existing full local gate; only the monthly command runs the whole harness and optionally updates its issue.
- **Full selection:** The monthly auditor sets `CI_LOCAL_FULL_SUITE=1`, so even a docs-only comparison executes every configured checker.
- **Paired pins:** Sync the supporting shared runner body with the audit assets.
- **Nested checks:** The runner consumes the override before child checks; ordinary local docs checks retain their shortcut.
- **Fresh proof:** Start from a fetched default branch, locked dependencies and a clean committed head. Reset declared safe caches, run every claimed checker from scratch, and record head/tree/comparison base, tool versions, configuration hashes and fresh logs for installed, configured, executed, passed and applied states.
- **Input boundary:** Hash only permitted committed configuration files. Ignore untracked/local artifacts, and refuse state/value files, backend caches and symlinks before opening their contents.
- **Applied enforcement:** Exercise real refusal and allowed cases against checker configurations. Separately read GitHub's active rulesets and branch protection to verify required statuses on default and protected interior branches; configuration text alone is insufficient.
- **Inventory:** Include every older hook and check with its owner, caller or registration evidence and actual fixture invocation. Run forbidden-edit, missing-evidence, stale-lock and allowed controls in the local gate; retain the newer migration, architecture and scanner negatives.
- **Incomplete execution:** Empty test summaries and skipped assertions, including lowercase, unittest and TAP output, cannot supply complete pass/applied proof. Record partial-suite skips as owned audit gaps while preserving the ordinary local gate’s existing behavior.
- **Gaps:** Open or update one continuing GitHub issue per repository, assigning an explicit owner for each gap. Missing access, skipped checks and unproved operator-only guards stay visible as gaps; never turn unknown evidence into a pass.
- **Failure loop:** Read and reproduce the named failing checker locally, fix it, rerun that checker and the directly affected suite, then run `scripts/ci-local` once before marking the PR ready. Batch fixes into one push.

### Pull requests and merge

- **CI-19: PR bodies, issues and PR comments are scannable lists with bold labels.** Use What → Why → Proof → Before merge (only if open), then the repo's Decision4 section when `boundary-map.yaml` exists, then Decision record at Repair/Migrate/Answer. One idea per bullet, at most two lines; no paragraph longer than two sentences. Proof names the check and result and maps every requirement id to its test, screenshot or change folder link. Links belong on labels or results. Preserve repo-specific checklists and never tick a human attestation. Use the full example below; never author old plain Decision4 fields or “Repair, choice story:” headings.
- **CI-25: The PR template asks “How hard is it to undo this PR after merging?” in an H2 section.** Select one bold class with its one colour circle and a concrete sentence naming who puts it right and what it takes. Repair and above need a standalone `**Recovery steps**` line followed by a top-level numbered list. Add Responsible for recovery (a named person at Answer) and Classification change (`None` or from -> to, by whom, why). Writing rules live in one HTML comment; the Recovery levels legend is collapsed. Use the upstream meanings: Undo — a revert puts it right; Repair — real work, contained to this team; Migrate — coordinated change involving other people; Answer — someone outside the team with standing to ask is affected, and nothing unmakes it. Decision record contains the Repair choice story, Migrate options (at least two, or one forced with its constraint), or Answer labelled evidence and challenges with no recommendation; omit it at Undo.
- **CI-26: Decision4 is a PR-body section, never a CI step.** A consuming repo has no `decision4` job, workflow or check, and none is required; the `ci.yml` template does not call the shared workflow. What a repo carries is the PR template section (CI-25), the agent-file contract (AGENT-23) and `boundary-map.yaml`. Never install checker code or fixtures in consumers. The public host `cdudek/blueprints` keeps `.github/workflows/decision4-check.yml`, `.github/scripts/decision4.py` and `tests/decision4/*` only to test the tool itself, with all good/bad fixtures. The host's checker validates the map against the embedded upstream schema at `4429f821780655f253a954b2659bf38e7b9d5517`, accepts H2/H3 and legacy aliases, strips comments/fences, treats none/n/a/-/placeholders as empty, and computes effective class = max(declared, changed-path floor). A lowering needs Classification change and still satisfies effective-class fields. Repair+ needs recovery; Repair needs its four choice-story fields under Decision record; Migrate needs options and responsibility; Answer needs a named person, labelled evidence, challenges and no recommendation. Unmapped or uncertain selectors log a map gap and never default to Undo. It reads the body and all changed and renamed paths through the PR API, using both base and proposed maps to prevent silent floor reductions.
- **CI-27: Changes to `boundary-map.yaml` are recorded Repair decisions needing the owner.** In team repos that choose CODEOWNERS, include the map and require owner review; solo-owner repos use CI-29. Selectors of different kinds combine with AND; highest matching floor wins. A path-only check cannot establish config, credential or environment selectors, so log a map gap and take the higher class pending owner review. A recorded class lowering alone never changes the map floor; change and review the map itself.
- **CI-28: CODEOWNERS is a team-repo choice, never installer-managed.** The kit and other sdlc adopters never create, edit or delete a CODEOWNERS file, including an older generated file, regardless of tier settings or configured owners. Team repos maintain their own routing; solo-owner repos need no self-approval listing. The adopt step installs the review and PR files (`REVIEW.md`, review workflows, PR template). The blueprint adds the Decision4 PR sections on top, with no check; there is one way, not two copies (see [sdlc](sdlc.md), [agent-files](agent-files.md)).
- **CI-29: A solo-owner repo cannot require approving reviews,** because an author cannot approve their own PR and every merge would block. Protect the gates by the required checks and the self-covering map entry (STR-28), not by a review count.
- **CI-20: Squash merge, with a Conventional Commit title.** The title decides the release type (see [release-and-deploy](release-and-deploy.md)). One change per PR.
- **CI-21: After the exact head passes `ci`, arm eligible PRs with `gh pr merge N --squash --auto`.** Read the PR's Decision4 section as advice, not a gate. Never arm auto-merge for `terraform/**`, Terraform workflows, approval-gated tiers or a Decision4 class (declared or the `boundary-map.yaml` floor of the changed paths) above Repair. Hand those to the owner. Check `gh pr view N --json mergeStateStatus,state`; if behind, update with `gh pr update-branch N --rebase` and rerun the local gate on the new head. If green and CLEAN but still open, squash merge the verified head. Name any required human approval that blocks landing.
- **CI-22: Branch from a freshly fetched default branch,** never from a stale local copy.
- **CI-33: `arch` and `perf` are separate steps in the local gate,** next to `slop`. `arch` runs boundaries and score dimensions using the stack's tools; `perf` runs applicable web and bundle budgets. Each reports its own failure and deltas, or "not applicable". See [architecture](architecture.md).
- **CI-24: Slop is a separate step in the local gate.** It runs the `slop` target: vendored anti-slop rules through Oxlint for TypeScript, plus separate metric collectors compared with the merge base. Biome stays in `lint` and `format-check`; it cannot run the Oxlint JavaScript plugins. Report slop failures and metric deltas separately.
- **CI-42: `migrate` is a separate step in the local gate,** next to `slop`, `arch` and `perf`. It runs Squawk over every new or changed migration (DAT-25), the released-version expand/contract guard (DAT-26), preflight coverage and specific-refusal tests (DAT-27), then all migrations from zero on disposable real Postgres and a schema drift comparison (DAT-28). It reports each result and checked file set separately; a failed check or unavailable dependency fails the gate. Only a product with no database reports "not applicable"; no changed migrations skips only the changed-file checks, not the fresh-database and drift checks. See [data-and-migrations](data-and-migrations.md).

### Local verification and cheap remote work

- **CI-34: `scripts/ci-local` owns the gate and is the only place checks are defined.** `scripts/ci-local` runs every check locally; `scripts/ci-local --ci` is what Actions runs (all checks except `LOCAL_ONLY_CHECKS`). It never pushes, never calls `gh` and never posts a status. Pushes are never gated: there is no pre-push hook, no `setup-hooks` and no `core.hooksPath`. Dirty worktrees are refused locally; a check that edits tracked files fails the local run. The runner stops at the first failure (`--keep-going` runs every check) and prints the last 80 lines of a failing check's log, in a `::group::` block under Actions, so the job output shows the error. Locally it runs the cheapest checks first, from the seconds recorded in `<git common dir>/ci-local/durations.json` (Actions has no history and keeps the config order); list a check in `CHECK_SERIAL` to pin its position when it needs an earlier one. It starts clean: it deletes its own container temp files and every path in `CI_LOCAL_CLEAN_PATHS` (repo-relative test output such as `test-results/` or `coverage/`), and unsets inherited relative-path variables such as `PYTHONPATH`, `NODE_PATH` and `COVERAGE_FILE`. Checks listed in `HEAVY_CHECKS` take a machine-wide lock (`${TMPDIR:-/tmp}/ci-local-heavy.lock`, or `CI_LOCAL_LOCK`) and print `waiting for heavy lock held by pid N` while another run holds it; a lock whose pid is dead is taken over, and Actions skips the lock. Run the local-only checks yourself before marking the PR ready. Never manufacture a `ci` result. Audit that the ruleset requires `ci` (CI-30).
- **CI-35: Debug locally before marking a PR ready.** Pushes to a draft are free, but a ready PR spends Actions minutes on every push. Read exactly which job or test failed and why, reproduce that test locally, fix it, then rerun only failing tests plus the directly affected suite until green. For an e2e change, run that spec and its neighbours locally. Then run `scripts/ci-local` once before marking the PR ready, batching fixes into one push. Never rerun a whole pipeline to retry one failed or flaky test, and never push a speculative fix. See [testing](testing.md) TEST-21.
- **CI-36: GitHub runs `ci` once per ready PR, plus work that needs GitHub or the cloud.** Deploys, previews, Terraform plans, comments, labels and scheduled jobs qualify. Do not run full CI again on main after a PR already passed; deployment may build and scan its immutable release artifact, without repeating the verification suite. Agents open one PR per milestone: push to a draft, then mark it ready once.
- **CI-37: Use the cheapest runner that works.** `ubuntu-slim` is a 1-vCPU runner at $0.002/min for short, light jobs such as comments, labels and small scripts. Use the 2-core `ubuntu-latest` tier for builds where that is the allocated tier; public repositories can receive a larger standard allocation. Standard GitHub-hosted runners in public repositories are free. macOS runners are only for Apple app release builds, triggered by a tag or manual dispatch, never every push or PR. Runner capacities and prices are checked against the dated [sources](sources.md) entry before choosing; do not pin an OS or language version in this rule.
- **CI-38: Two jobs, not many (see CI-43).** `static` fails fast on its own; `checks` shares one setup across named steps and reports each result. Billable minutes round up per job, so many tiny jobs repeat setup and rounding. Add a job only when isolation or a measured wall-clock improvement justifies it. Keep lint, slop, arch and perf as distinct steps, not mandatory separate runners.
- **CI-39: Avoid superseded and irrelevant runs.** PR workflows use concurrency keyed by workflow and PR with `cancel-in-progress: true`, plus path filters for the work they actually do. A required status must still report when paths are skipped; do not filter its entire workflow away. Deploys and cleanup that must serialize use their own concurrency groups with `cancel-in-progress: false`.
- **CI-40: Dependabot batches routine work monthly.** Per ecosystem set `schedule.interval: monthly`, `open-pull-requests-limit: 3` and a group with `patterns: ["*"]` and `update-types: [minor, patch]`, yielding one routine PR per ecosystem. Keep major updates separate for review. Define a second group with `applies-to: security-updates` and `patterns: ["*"]`, and enable security updates so grouped fixes arrive immediately, outside the monthly routine schedule. The version-update limit does not cap security PRs. See the configuration reference in [sources](sources.md).
- **CI-41: `scripts/deps-land` lands a grouped dependency PR.** Check out the grouped PR's exact head, inspect its changes and run `scripts/ci-local` on it. The [shared driver](deps-land.py) arms squash auto-merge only after the exact head passes and CI-21 proves eligibility; majors, uncertain changes and owner-only decisions are handed back. Rebase invalidates the gate. Preserve pending worktrees until landing, and never merge unverified bot PRs. Dependabot runs weekly with one grouped PR per ecosystem and a cooldown ([template](dependabot.yml)).
- **CI-42: An app's sdlc gate runs the cheap checks first, and rebuilds before E2E.** `scripts/ci-local --cheap` runs every check except `HEAVY_CHECKS`, takes no lock, writes no receipt, pushes nothing and ends with `CHEAP PASS <sha>` or `CHEAP FAIL check=<name>`; it cannot be combined with `--ci`. List it as the first entry of `checks.milestone` in `sdlc.json`, so cheap failures (complexity ratchet, secrets, docs format, decision record, workflow lint) surface in a minute, before any heavy run. A check that needs the output of a heavy check goes in `HEAVY_CHECKS` too, because `--cheap` cannot tell the dependency. A gate step that runs E2E against a production build rebuilds that build first (`E2E_BUILD=1 npm run build` or the repo's equivalent): a stale `.next` tests an old app against new specs.
- **CI-43: Every check belongs to one stage, and CI runs stages, not the whole list.** `CHECK_STAGES` in the repo config is parallel to `CHECK_NAMES`; `scripts/ci-local --stage <name>` runs one stage (combinable with `--ci` and `--keep-going`; a stage with no checks prints `no checks in stage <name>` and passes; a config without `CHECK_STAGES` is all `static`). The stages, in order: `static` (format, lint, typecheck, arch, slop, secrets, workflow-lint, deps-land, docs-format, docs-links and every other fast source-only check), `unit` (unit tests, JS and Python), `build` (the production build), `extras` (repo-specific gates: migrate, blueprint, enforcement, fitness gates, indexer checks), `e2e-smoke` (3 to 5 critical journeys against a disposable local stack; the large E2E suite stays local). The [workflow template](ci.yml) runs `static` and `checks` in parallel; `checks` has one named step per stage after `static`, each with `if: !cancelled()`; `ci` needs both. Use the same check names in every repo (`unit`, `gates`). `perf` (Lighthouse on a shared runner is noise) and `docker` are never PR CI: list them in `LOCAL_ONLY_CHECKS` and run them weekly or locally. A run with `--stage` keeps its logs apart from the receipt folder of a full run.

### Make contract

- **CI-23: Every repo defines the same standard targets,** named in kebab-case, so one habit works across stacks. A target with nothing to do prints "not applicable" and exits 0.
  - `setup`: install dependencies from the lockfile, install git hooks.
  - `dev`: run the app locally.
  - `lint`, `format` and `format-check`: general static checks, formatting and its non-mutating check. TypeScript uses Biome; Python keeps its stack linter and formatter.
  - `slop`: Oxlint restricted to the vendored anti-slop rules for TypeScript, plus separate slop metric collectors, its own local gate step (see [code-quality](code-quality.md)).
  - `typecheck`: the type checker over all source.
  - `test` and `test-integration`: fast tests; tests needing a database or browser.
  - `arch`: boundary and import rules and the architecture score (ArchUnitTS for TypeScript; import-linter for Python boundaries; see [structure](structure.md), [architecture](architecture.md)).
  - `perf`: the web and bundle budgets of [architecture](architecture.md).
  - `fitness`: every dimension of `architecture.yaml`, writing `fitness-report.json`.
  - `gates-test`: the negative fixtures of every gate (see [testing](testing.md) TEST-19).
  - `check`: every local verification step, in order. This is the verify command of CI-1.
  - `migrate`: migration safety checks, refusal tests, application from zero to disposable Postgres and schema drift comparison (CI-42). The release job separately invokes the production migration runner with its DDL identity (DAT-17).
  - `docker-build`: build the image.
  - `help` is the default goal and lists every target with its one-line description.
  Each stack maps these names to its own tools; the names stay fixed. Agent files name these targets, not raw tool commands.

```make
check: format-check lint slop typecheck test test-integration arch perf migrate gates-test  ## full local verification suite
```

## How to apply

1. Create the Make contract and full local `check`, then implement `scripts/ci-local` and `.github/workflows/ci.yml` from the [template](ci.yml) (CI-3, CI-34).
2. Add scanners and the Decision4 PR fields (no CI step for Decision4). Install review files through the sdlc adopt step; a team maintains CODEOWNERS itself if it chooses to use it; verify the local gate is implemented rather than assuming adoption installs it.
3. Apply rulesets requiring `ci`, enable squash merge and auto-merge, and verify enforcement on default and interior branches.
4. Add only necessary remote workflows, using CI-37 through CI-39, and skip bot and draft previews ([release-and-deploy](release-and-deploy.md) REL-20).
5. Configure weekly grouped dependency updates from the [template](dependabot.yml) and `scripts/deps-land`; add new guard tests to the local gate in the same PR.
6. Adopt the pinned monthly auditor, inventory older guards and add its cheap configuration and refusal fixtures to the local gate; keep the monthly command reminder in engineering docs (CI-30/31).

## Migrating a consumer repo

1. Replace `scripts/ci-local` with the [new runner](ci-local.sh). Keep the repo's `CHECK_NAMES`, `CHECK_COMMANDS` and `CHECK_TOOLS`, set `LOCAL_ONLY_CHECKS` to the heavy checks Actions should skip, and optionally set `HEAVY_CHECKS`, `CHECK_SERIAL` and `CI_LOCAL_CLEAN_PATHS` (all default to empty).
2. Delete `.githooks/pre-push`, `scripts/setup-hooks`, any `prepare` script or `core.hooksPath` setup, and `scripts/ai-review.py`.
3. Add `.github/workflows/ci.yml` from the [template](ci.yml), editing only the `SLOT` lines (toolchain, services, env, permissions), map every check to a stage in `CHECK_STAGES` (CI-43), and delete any `decision4` job.
4. Replace `.github/dependabot.yml` with the [template](dependabot.yml), keeping only the repo's ecosystems.
5. In rulesets or branch protection, require `ci` instead of `local-ci` and `decision4`. Do this after `ci` has run green on a PR.
6. Run `git config --unset core.hooksPath` locally.

## Checks

- Automatic: action SHA pins, timeouts and least privilege; applicable paths and concurrency; no redundant main verification run or per-PR macOS build.
- Automatic: the runner rejects failed checks, dirty heads locally and a missing tool in `--ci`; `ci` depends on `checks` only and skips drafts; `ci-local` has no push, `gh` or status code.
- Automatic: the shared host's Decision4 fixtures pass; consumers contain no Decision4 job, workflow or checker code; the code-owners file lists the boundary map; every Make target exists; arch, perf, slop, migrate and guard tests feed the local gate.
- Automatic: Dependabot weekly, one group per ecosystem, a cooldown and a PR limit of two; `scripts/deps-land` reruns the gate after a changed head.
- Review: CI-30 enforcement rows distinguish documentation from installed and applied gates; the monthly local audit and its continuing owner-assigned issue are current; preview eligibility and serialization are correct.

## Mistakes to avoid

- A review gate documented but disabled in the workflow config, with no code owners file.
- Verify command named in docs that did not exist.
- Required job that skipped the guard tests, so rules regressed silently.
- Floating action tags that changed under the pipeline.
- A step timeout raised to hide a slow build instead of finding the cause.
- A "green" PR handed over while it was behind the default branch and could not merge.
- A tally line not tied to a commit, so a stale review passed a later push.
- A PR template with a Decision-Class field nobody validated, so every PR said Undo.
- A new required check added to the docs but never applied to the repo settings, so merges ignored it.
- A map edited in a feature PR by the author, lowering the floor of the ground it changed.

## Pull requests, issues and PR comments: scannable, never a text blob

- **Order:** `## What` → `## Why` → `## Proof` → `## Before merge` (only while something is open) → the repo's Decision4 section (only with `boundary-map.yaml`) → `## Decision record` (at Repair/Migrate/Answer).
- **Bullets:** Every section is a list; start each bullet with a bold label (`- **Source plan:** 0 adds, 8 updates, 38 destroys.`). Keep one idea per bullet, at most two lines, and no paragraph longer than two sentences. Keep checklist syntax and bold-label the item.
- **Proof:** Name the check and result (`- **Unit tests:** 1,320 passed.`). Put links on the label or result, never a bare URL in prose. Preserve claims and human checklist attestations when restructuring an existing body.
- **Decision4:** When the repo has a boundary map, read it and copy the exact readable section from its PR template. Select its highest applicable class in bold with one colour circle and a sentence explaining recovery; use bold-labelled Recovery steps (numbered for multiple steps), optional Work preserved, Responsible for recovery (a named person at Answer), and Classification change. Keep the Recovery levels legend collapsed. Never author old plain `Decision-Class:` lines.
- **Decision record:** At Repair use Chose / Over / Because / Commits us to. At Migrate use at least two real Options, or one Forced option with its Constraint. At Answer use labelled Evidence and Challenges, with no recommendation. Use `## Decision record`; omit it at Undo.
- **Milestone and review text:** The same layout covers milestone-close PRs, issue bodies and PR comments. Put addressed feedback under What, its rationale under Why and its check results under Proof. A short thread reply can be one bold-labelled bullet; include only applicable sections.
- **Validation:** Validate the proposed body before pushing and the actual body after creation or edits against the PR template. Use `--body-file`; scannable formatting applies with or without a Decision4 section.

Full example (illustrative evidence, not claims to copy):

```markdown
## What

- **Change:** Correct generated agent guidance.

## Why

- **Reason:** Already generated files need team follow-up after the rule changes.

## Proof

- **Contract fixtures:** All cases passed locally.

## How hard is it to undo this PR after merging?

**🟡 Repair** — <who has to put it right and what it takes, concrete>

**Recovery steps**

1. <first step>
2. <next step>

- **Responsible for recovery:** <role; at Answer a named person>
- **Classification change:** None

## Decision record

<!-- Keep only the block for the selected class; delete this section at Undo. -->

**Repair**

- **Chose:** <what was decided>
- **Over:** <viable alternative>
- **Because:** <reason>
- **Commits us to:** <what this ties the team to>

**Migrate**

<!-- An agent drafts viable options; the accountable owner chooses on the record. -->
- **Class:** Migrate; put-right: <coordinated change needed if wrong>
- **Who answers:** <accountable person or role>
- **Commits us to:** <what the chosen option ties the team to and how it could fail later>
- **Chosen by:** <person>

**Options**

1. **Option 1:** <viable option>; **Commits to:** <its commitments>
2. **Option 2:** <viable option>; **Commits to:** <its commitments>

<!-- Or one numbered Forced option with its Constraint and Commits to. -->

**Answer**

<!-- Evidence and challenge only: no recommendation or ranking. General knowledge is not evidence about this case.
A person with standing writes Decision and Commits us to; agents leave <person writes> and validation fails until filled.
Every evidence claim is labelled observed / inferred / asked / unknown. Revisit when is a condition, not only a date. -->
- **Title:** <decision title>
- **Status:** <proposed / accepted / superseded / retired>
- **Context:** <case-specific context>
- **Decision:** <person writes>
- **Class:** Answer; put-right: <who outside the team is affected and why nothing unmakes it>
- **Who answers:** <named person or @handle with standing>
- **Rejected alternative:** <a viable alternative>
- **Provenance:** <evidence and challenges supplied by the agent; choice made by the person>
- **Class history:** <escalations, recorded de-escalations and designs that lowered the class; or unchanged>
- **Commits us to:** <person writes>
- **Last validated:** <when and by whom this was checked>
- **Revisit when:** <condition that calls for revalidation>

**Evidence**

- **observed:** <checked directly by reading, running or measuring>
- **inferred:** <reasoned from observations>
- **asked:** <what a person who was asked said>
- **unknown:** <material gap not established by anyone>

**Challenges**

- **Challenge:** <what would make the decision wrong>

<details>
<summary>Recovery levels</summary>

Undo — a revert puts it right
Repair — real work, contained to this team
Migrate — coordinated change involving other people
Answer — someone outside the team with standing to ask is affected, and nothing unmakes it

</details>

🤖 Generated with Codex
```
