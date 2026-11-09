---
name: ci
description: One verify command, the CI workflows and their hardening, the AI review brief, the PR template, merge rules, and the Make contract of standard target names.
read-when: setting up CI or a Makefile, adding a workflow or scanner, writing REVIEW.md or the PR template, or a check fails or is skipped.
skip-when: you are changing product code and the pipeline already covers it.
---

# CI

One local command defines "good" and publishes proof for the exact commit. GitHub keeps work that needs GitHub or cloud access: deploys, previews, Terraform plans and scheduled jobs. Rulesets require the local proof before merge; free public runners do not turn remote CI into a debugging loop.

## Rules

### One command, one gate

- **CI-1: There is one verify command: format check, lint, slop, typecheck, test.** `scripts/ci-local` calls this command before pushing (CI-34). When it fails, fix the code, not the test or the check.
- **CI-2: Targets follow a fixed contract** (see "Make contract" below), so every repo and every agent uses the same names.
- **CI-3: Two required commit statuses gate the merge: `local-ci` and `decision4`.** The repository-owned gate publishes them for the exact pushed head after successful validation (CI-34); rulesets require both on default and protected interior branches. A repository still migrating may keep its existing required remote check until the replacement is applied and verified (CI-30).
- **CI-4: Select local checks from the changed stacks.** A nonempty diff containing only Markdown or plain-text documents runs format, local link checks and Decision4; a mixed, code, unknown-path or empty diff runs the full gate. A file under `docs/` or `changes/` is not automatically documentation. Both required statuses remain unchanged. The canonical runner is [ci-local.sh](ci-local.sh), its hook is [ci-local-pre-push.sh](ci-local-pre-push.sh), and positive, mixed and refusal fixtures run with `python3 -m unittest discover -s core/tests -v`. Copy the runner byte-for-byte after `# END REPO CONFIG`; configure stack checks and optional remote-only plan evidence only above that line.
- **CI-5: Guard tests run in the required local gate.** A test not in the required local gate is decoration (see [testing](testing.md)).

### Workflow hygiene

- **CI-6: Least privilege.** Each workflow sets `permissions` to read-only by default and widens per job. Every job has a timeout.
- **CI-7: Checkout uses `persist-credentials: false`.** Jobs that push use a short-lived app token, not the default token.
- **CI-8: Pin every third-party action to a full commit SHA,** with the version as a comment. The dependency bot keeps pins current.
- **CI-9: Cloud access is keyless** through workload identity, never a stored key. Secrets reach a job only if that job needs them. See [env-and-secrets](env-and-secrets.md).
- **CI-10: Scanners run in the local gate:** secret scanning, workflow linting, container scanning and infrastructure-as-code scanning where applicable. Cloud image publication scans the image it publishes too. Dependency updates follow CI-40. Use local/CI image scanners such as Trivy; enabling paid Google registry scanning needs the separate opt-in of [release-and-deploy REL-19](release-and-deploy.md).
- **CI-11: A comment explains each non-obvious step.** Why this flag, why this order, what breaks without it.
- **CI-12: Test the scripts and hooks that CI relies on,** and change them in the same PR as the convention they implement.

### AI review

- **CI-13: `scripts/ci-local` runs one AI review on the exact PR head against `REVIEW.md`.** Prefer Codex CLI when installed and logged in; otherwise use authenticated Claude. Read the diff once and open a source file only when the diff cannot settle a finding. Cache the result by exact head and base so body validation never repeats the review; a changed head requires fresh evidence. No Actions minutes are used.
- **CI-14: `REVIEW.md` defines three passes:** bugs, security (secrets or personal data in logs, missing timeout, swallowed exception, new network egress, widened permission, auth trusting client input), and compliance (the change matches its facts and plan, follows the agent files, and does not make any of them false).
- **CI-15: "Important" means real breakage:** broken behavior, a write to the wrong system, leaked data, or a breached rule no test catches. Style and preference are nits. Report at most five nits and count the rest.
- **CI-16: The reviewer skips what the local gate already enforces,** and generated files such as lockfiles.
- **CI-17: The review writes a machine-readable tally the local merge gate reads,** bound to the reviewed commit and base. Put a short tally in the PR body inside one collapsed Local AI review block: findings by severity, reviewer and full head SHA. Preserve the rest of the body and update the existing block on a new head:

```text
Reviewer: <codex|claude>  SHA: <head sha>
Findings: critical <n>, high <n>, medium <n>, low <n>
```

- **CI-18: A review gate that docs promise must exist.** If the local review is missing or cannot authenticate, the gate fails and the docs say so; a suspended Actions workflow never counts as review evidence. A "needs owner approval" tier requires a code-owners file and a required-review rule, or it is not called that.

- **CI-32: AI review also asks CUPID questions,** inside the same review, not as a second pass. Is the change composable (small, with a clear interface)? Does it add a hidden dependency? Does it have a surprising side effect? Does it follow the idiom of the code around it? Does it use the domain vocabulary (see [code-quality](code-quality.md))? Findings use the same severity tally and fix loop within that one local review. No scores.

### Enforcement audit

- **CI-30: Every rule that claims a check has an enforcement row.** Per rule: the checker, what invokes it (hook or job), whether its status is required, and the last run with evidence. Installed, configured, executed and passed are four separate states. A check that is not required, or never ran, means the rule is unenforced and the docs say so (CI-18). A ruleset or required check that needs a manual apply leaves a new gate optional until someone applies it, so the audit lists "applied" too.
- **CI-31: A monthly harness audit runs independently of the pipeline.** Each rule's check is exercised on its own, so one failing check cannot hide another, and the result is compared with the enforcement rows of CI-30. Gaps become findings with an owner.

### Monthly local harness audit

- **Operation:** An agent runs `scripts/harness-audit --issue` on the owner's Mac once each month in every adopting repository. Keep this reminder in that repository's engineering docs; use no Actions schedule, cron or launchd job.
- **Shared source:** The executable and legacy fixture adapters belong to `core/references/harness-audit.py`, `legacy-guards-test.py` and `sync-harness-audit.py` in this repository. Consumers sync immutable source pins and hashes with repository-owned command and owner manifests.
- **Adoption:** From a clean blueprint checkout, run `python3 core/references/sync-harness-audit.py <consumer-worktree> --pin <merged-source-sha>`; inspect the dry run, then add `--write`. Commit the two copied executables and `.harness-audit.lock`.
- **Manifest:** `.harness-audit.json` declares an explicit GitHub owner, default branch, actual local check IDs, tool version probes, configuration paths, claimed rules and legacy caller/fixture evidence. Optional repository binding and protected refs keep platform proof explicit.
- **Gate wiring:** Run `python3 scripts/legacy-guards-test.py` and `python3 scripts/harness-audit --verify-config` as cheap checks in the existing full local gate; only the monthly command runs the whole harness and optionally updates its issue.
- **Default-head review:** At the fetched default head, the auditor supplies a fresh no-change body for the owned review and Decision4 checks; it does not claim a pass or publish commit statuses. Issue writes recheck the manifest repository binding.
- **Fresh proof:** Start from a fetched default branch, locked dependencies and a clean committed head. Reset declared safe caches, run every claimed checker from scratch, and record head/tree/comparison base, tool versions, configuration hashes and fresh logs for installed, configured, executed, passed and applied states.
- **Applied enforcement:** Exercise real refusal and allowed cases against checker configurations. Separately read GitHub's active rulesets and branch protection to verify required statuses on default and protected interior branches; configuration text alone is insufficient.
- **Inventory:** Include every older hook and check with its owner, caller or registration evidence and actual fixture invocation. Run forbidden-edit, missing-evidence, stale-lock and allowed controls in the local gate; retain the newer migration, architecture and scanner negatives.
- **Incomplete execution:** Empty test summaries and skipped assertions, including lowercase, unittest and TAP output, cannot supply complete pass/applied proof. Record partial-suite skips as owned audit gaps while preserving the ordinary local gate’s existing behavior.
- **Gaps:** Open or update one continuing GitHub issue per repository, assigning an explicit owner for each gap. Missing access, skipped checks and unproved operator-only guards stay visible as gaps; never turn unknown evidence into a pass.
- **Failure loop:** Read and reproduce the named failing checker locally, fix it, rerun that checker and the directly affected suite, then run the full local gate once before pushing. Batch fixes into one verified push; remote CI confirms the result.

### Pull requests and merge

- **CI-19: PR bodies, issues and PR comments are scannable lists with bold labels.** Use What → Why → Proof → Before merge (only if open), then the repo's Decision4 section when `boundary-map.yaml` exists, then Decision record at Repair/Migrate/Answer. One idea per bullet, at most two lines; no paragraph longer than two sentences. Proof names the check and result and maps every requirement id to its test, screenshot or change folder link. Links belong on labels or results. Preserve repo-specific checklists and never tick a human attestation. Use the full example below; never author old plain Decision4 fields or “Repair, choice story:” headings.
- **CI-25: The PR template asks “How hard is it to undo this PR after merging?” in an H2 section.** Select one bold class with its one colour circle and a concrete sentence naming who puts it right and what it takes. Repair and above need a standalone `**Recovery steps**` line followed by a top-level numbered list. Add Responsible for recovery (a named person at Answer) and Classification change (`None` or from -> to, by whom, why). Writing rules live in one HTML comment; the Recovery levels legend is collapsed. Use the upstream meanings: Undo — a revert puts it right; Repair — real work, contained to this team; Migrate — coordinated change involving other people; Answer — someone outside the team with standing to ask is affected, and nothing unmakes it. Decision record contains the Repair choice story, Migrate options (at least two, or one forced with its constraint), or Answer labelled evidence and challenges with no recommendation; omit it at Undo.
- **CI-26: Share the Decision4 check by reference.** The public shared host is `cdudek/blueprints`: `.github/workflows/decision4-check.yml`, `.github/scripts/decision4.py` and `tests/decision4/*`. Consuming Actions repos have only a caller `decision4.yml`, PR events opened/edited/synchronize/reopened, concurrency cancellation, and a single `uses: cdudek/blueprints/.github/workflows/decision4-check.yml@<40-hex SHA>` job; the called job runs on `ubuntu-slim`. Local-gate repos fetch the single checker at a pinned commit, verify its recorded SHA-256, cache under `.git/ci-local/`, and run it through `scripts/ci-local --decision4`. Never install checker code or fixtures in consumers. The host tests all good/bad fixtures. The checker validates the map against the embedded upstream schema at `4429f821780655f253a954b2659bf38e7b9d5517`, accepts H2/H3 and legacy aliases, strips comments/fences, treats none/n/a/-/placeholders as empty, and computes effective class = max(declared, changed-path floor). A lowering needs Classification change and still satisfies effective-class fields. Repair+ needs recovery; Repair needs its four choice-story fields under Decision record; Migrate needs options and responsibility; Answer needs a named person, labelled evidence, challenges and no recommendation. Unmapped or uncertain selectors log a map gap and never default to Undo. The reusable workflow obtains the body and all changed and renamed paths through the PR API, using both base and proposed maps to prevent silent floor reductions. Body edits invalidate previous evidence.
- **CI-27: Changes to `boundary-map.yaml` are recorded Repair decisions needing the owner.** In team repos that choose CODEOWNERS, include the map and require owner review; solo-owner repos use CI-29. Selectors of different kinds combine with AND; highest matching floor wins. A path-only check cannot establish config, credential or environment selectors, so log a map gap and take the higher class pending owner review. A recorded class lowering alone never changes the map floor; change and review the map itself.
- **CI-28: CODEOWNERS is a team-repo choice, never installer-managed.** The kit and other sdlc adopters never create, edit or delete a CODEOWNERS file, including an older generated file, regardless of tier settings or configured owners. Team repos maintain their own routing; solo-owner repos need no self-approval listing. The adopt step installs the review and PR files (`REVIEW.md`, review workflows, PR template). The blueprint adds the Decision4 sections and the local `decision4` validation on top; there is one way, not two copies (see [sdlc](sdlc.md), [agent-files](agent-files.md)).
- **CI-29: A solo-owner repo cannot require approving reviews,** because an author cannot approve their own PR and every merge would block. Protect the gates by the required checks and the self-covering map entry (STR-28), not by a review count.
- **CI-20: Squash merge, with a Conventional Commit title.** The title decides the release type (see [release-and-deploy](release-and-deploy.md)). One change per PR.
- **CI-21: After the exact head passes local-ci and Decision4, arm eligible PRs with `gh pr merge N --squash --auto`.** Never arm auto-merge for `terraform/**`, Terraform workflows, approval-gated tiers or an effective Decision4 class above Repair. Hand those to the owner. Check `gh pr view N --json mergeStateStatus,state`; if behind, update with `gh pr update-branch N --rebase` and rerun the full local gate on the new head. If green and CLEAN but still open, squash merge the verified head. Name any required human approval that blocks landing.
- **CI-22: Branch from a freshly fetched default branch,** never from a stale local copy.
- **CI-33: `arch` and `perf` are separate steps in the local gate,** next to `slop`. `arch` runs boundaries and score dimensions using the stack's tools; `perf` runs applicable web and bundle budgets. Each reports its own failure and deltas, or "not applicable". See [architecture](architecture.md).
- **CI-24: Slop is a separate step in the local gate.** It runs the `slop` target: vendored anti-slop rules through Oxlint for TypeScript, plus separate metric collectors compared with the merge base. Biome stays in `lint` and `format-check`; it cannot run the Oxlint JavaScript plugins. Report slop failures and metric deltas separately.
- **CI-42: `migrate` is a separate step in the local gate,** next to `slop`, `arch` and `perf`. It runs Squawk over every new or changed migration (DAT-25), the released-version expand/contract guard (DAT-26), preflight coverage and specific-refusal tests (DAT-27), then all migrations from zero on disposable real Postgres and a schema drift comparison (DAT-28). It reports each result and checked file set separately; a failed check or unavailable dependency fails the gate. Only a product with no database reports "not applicable"; no changed migrations skips only the changed-file checks, not the fresh-database and drift checks. See [data-and-migrations](data-and-migrations.md).

### Local verification and cheap remote work

- **CI-34: `scripts/ci-local` owns the local-first gate.** A pre-push hook invokes it; direct invocation runs the selected complete local gate (CI-4), pushes the verified commit, then posts `local-ci` and `decision4` for that exact SHA. The FIRST push of a branch requires a nonempty proposed PR body file through `CI_LOCAL_PR_BODY` (legacy `CI_LOCAL_BODY_FILE` also works), validated by the pinned shared Decision4 checker against both boundary maps and all changed/renamed paths. The hook enforces this even with an existing local-check receipt. Create the PR after pushing and validate its actual exact-head/body before Decision4 reports success. Edits, commits, rebases and merges invalidate previous results; dirty/moved heads, failed checks, pushes or status publication fail closed. Never manufacture statuses or copy another SHA's evidence. Audit that the ruleset requires both statuses (CI-30).
- **CI-35: Debug locally before every push.** Never push to "see what CI says". Read exactly which job or test failed and why, reproduce that test locally, fix it, then rerun only failing tests plus the directly affected suite until green. For an e2e change, run that spec and its neighbours locally. Then run the full local gate once before pushing, batching fixes into one push. Never rerun a whole pipeline to retry one failed or flaky test, and never push a speculative fix. Existing remote CI confirms the local result; waiting on GitHub for feedback a local run could give is a process defect. See [testing](testing.md) TEST-21.
- **CI-36: GitHub runs only work that needs GitHub or the cloud.** Deploys, previews, Terraform plans, comments, labels and scheduled jobs qualify. Format, lint, typecheck, tests and local builds belong in CI-34. Do not run full CI again on main after a PR already passed; deployment may build and scan its immutable release artifact, without repeating the verification suite.
- **CI-37: Use the cheapest runner that works.** `ubuntu-slim` is a 1-vCPU runner at $0.002/min for short, light jobs such as comments, labels, a transitional remote Decision4 check and small scripts. Use the 2-core `ubuntu-latest` tier for builds where that is the allocated tier; public repositories can receive a larger standard allocation. Standard GitHub-hosted runners in public repositories are free. macOS runners are only for Apple app release builds, triggered by a tag or manual dispatch, never every push or PR. Runner capacities and prices are checked against the dated [sources](sources.md) entry before choosing; do not pin an OS or language version in this rule.
- **CI-38: Share setup within one job per stack where possible.** Install once, run sequential named steps and report each result. Billable minutes round up per job, so many tiny jobs repeat setup and rounding. Use separate jobs only when isolation or a measured wall-clock improvement justifies them. Keep lint, slop, arch and perf as distinct steps, not mandatory separate runners.
- **CI-39: Avoid superseded and irrelevant runs.** PR workflows use concurrency keyed by workflow and PR with `cancel-in-progress: true`, plus path filters for the work they actually do. A required status must still report when paths are skipped; do not filter its entire workflow away. Deploys and cleanup that must serialize use their own concurrency groups with `cancel-in-progress: false`.
- **CI-40: Dependabot batches routine work monthly.** Per ecosystem set `schedule.interval: monthly`, `open-pull-requests-limit: 3` and a group with `patterns: ["*"]` and `update-types: [minor, patch]`, yielding one routine PR per ecosystem. Keep major updates separate for review. Define a second group with `applies-to: security-updates` and `patterns: ["*"]`, and enable security updates so grouped fixes arrive immediately, outside the monthly routine schedule. The version-update limit does not cap security PRs. See the configuration reference in [sources](sources.md).
- **CI-41: `scripts/deps-land` lands a grouped dependency PR.** Check out the grouped PR's exact head, inspect its changes and run `scripts/ci-local` to publish evidence. The [shared driver](deps-land.py) arms squash auto-merge only after the exact head passes and CI-21 proves eligibility; majors, uncertain changes and owner-only decisions are handed back. Rebase invalidates the gate. Preserve pending worktrees until landing, and never manufacture statuses or merge unverified bot PRs.

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

1. Create the Make contract and full local `check`, then implement `scripts/ci-local`, its pre-push hook and exact-SHA status publication (CI-34).
2. Add scanners, a pinned reference to Decision4 validation and the PR fields; fixtures stay only in the shared host. Install review files through the sdlc adopt step; a team maintains CODEOWNERS itself if it chooses to use it; verify the local gate is implemented rather than assuming adoption installs it.
3. Apply rulesets requiring `local-ci` and `decision4`, enable squash merge and auto-merge, and verify enforcement on default and interior branches.
4. Add only necessary remote workflows, using CI-37 through CI-39, and skip bot and draft previews ([release-and-deploy](release-and-deploy.md) REL-20).
5. Configure monthly grouped dependency updates and `scripts/deps-land`; add new guard tests to the local gate in the same PR.
6. Adopt the pinned monthly auditor, inventory older guards and add its cheap configuration and refusal fixtures to the local gate; keep the monthly command reminder in engineering docs (CI-30/31).

## Checks

- Automatic: action SHA pins, timeouts and least privilege; applicable paths and concurrency; no redundant main verification run or per-PR macOS build.
- Automatic: the local gate and hook reject failed checks, dirty or moved heads and failed status publication; both required statuses refer to the verified head.
- Automatic: shared-host Decision4 fixtures pass; consumers contain only a pinned reference; the code-owners file lists the boundary map; every Make target exists; arch, perf, slop, migrate and guard tests feed the local gate.
- Automatic: Dependabot routine and security groups, monthly schedule and PR limit; `scripts/deps-land` reruns the gate after a changed head.
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
- **Validation:** Validate the proposed body before pushing and the actual body after creation or edits through the repo's Decision4 gate when installed. Use `--body-file`; scannable formatting applies even without Decision4.

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
