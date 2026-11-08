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
- **CI-4: Docs-only PRs skip irrelevant code checks** but run their applicable local checks and Decision4 validation; both required statuses still report. Use changed paths; a mixed PR runs every affected stack.
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

- **CI-13: An AI reviewer reads the diff against `REVIEW.md`** once per non-bot PR, and again on a re-review label. It reads the diff once and opens a file only when the diff cannot settle a finding.
- **CI-14: `REVIEW.md` defines three passes:** bugs, security (secrets or personal data in logs, missing timeout, swallowed exception, new network egress, widened permission, auth trusting client input), and compliance (the change matches its facts and plan, follows the agent files, and does not make any of them false).
- **CI-15: "Important" means real breakage:** broken behavior, a write to the wrong system, leaked data, or a breached rule no test catches. Style and preference are nits. Report at most five nits and count the rest.
- **CI-16: The reviewer skips what the local gate already enforces,** and generated files such as lockfiles.
- **CI-17: The review ends with a machine-readable tally line the merge gate reads,** bound to the reviewed commit:

```text
IMPORTANT: <n>  NITS: <m>  SHA: <head sha>
```

- **CI-18: A review gate that docs promise must exist.** If the workflow is off, the docs say so. A "needs owner approval" tier requires a code-owners file and a required-review rule, or it is not called that.

- **CI-32: AI review also asks CUPID questions,** inside the same review, not as a second pass. Is the change composable (small, with a clear interface)? Does it add a hidden dependency? Does it have a surprising side effect? Does it follow the idiom of the code around it? Does it use the domain vocabulary (see [code-quality](code-quality.md))? Findings use the existing severity levels, tally line and single fix round. No scores.

### Enforcement audit

- **CI-30: Every rule that claims a check has an enforcement row.** Per rule: the checker, what invokes it (hook or job), whether its status is required, and the last run with evidence. Installed, configured, executed and passed are four separate states. A check that is not required, or never ran, means the rule is unenforced and the docs say so (CI-18). A ruleset or required check that needs a manual apply leaves a new gate optional until someone applies it, so the audit lists "applied" too.
- **CI-31: A monthly harness audit runs independently of the pipeline.** Each rule's check is exercised on its own, so one failing check cannot hide another, and the result is compared with the enforcement rows of CI-30. Gaps become findings with an owner.

### Pull requests and merge

- **CI-19: The PR template maps each requirement to its proof:** the fact or rule id, the test or screenshot that shows it, and the change folder link.
- **CI-25: The PR template asks “How hard is it to undo this PR after merging?”** Use that exact level-three heading. Select one bold class with one coloured circle beside it: `**🟢 Undo**`, `**🟡 Repair**`, `**🟠 Migrate**` or `**🔴 Answer**`; no other coloured circles appear in the section. The sentence after the class explains why this class applies with concrete recovery requirements, never “contained fix-up”. Use the plain labels **Recovery steps**, **Work preserved** (optional), **Responsible for recovery** and **Classification change**. Recovery steps are ordered, numbered when there is more than one; for Undo the sentence may suffice and steps may be omitted. Do not repeat the sentence in the steps, invent steps to fit a class, or claim preserved work or backups unless the PR supports them. Responsible for recovery names a role; Answer requires a named person. Classification change is `None` unless the class changes; then record `<from> -> <to>; <lowered or raised> by <who>; <why>`. Choose one class per PR, the highest that applies; split a PR whose parts need very different classes. Put the writing rules in the template's HTML comment and the four recovery levels in a collapsible “Recovery levels” block: Undo — revert only; Repair — revert plus fixes or a release; Migrate — move data, state or users back; Answer — cannot fully recover, a named person is accountable.
- **CI-26: The required `decision4` status comes from the gate's Decision4 validation.** It validates `boundary-map.yaml` against the schema, pinned by commit SHA (the recorded Decision4 commit, see [sources](sources.md)), never by a movable tag. It strips HTML comments from the PR body non-greedily across lines, including an unterminated comment's remaining text. The selected bold class under CI-25's heading maps to Decision4 v1 `Decision-Class` (the circle is optional for parsing); **Recovery steps** maps to `Put-right`, **Responsible for recovery** (also accepted: **Accountable person**) to `Answerer`, and **Classification change** to `Class-Change`. **Work preserved** is optional context. The old `Field: value` and `- **Field:** value` forms remain accepted; plain, list and bold-label forms work for all field labels. Exactly one class is allowed; when both the selected bold class and the old field are present they must agree. A value of `none`, `n/a`, `-` or a `<placeholder>` counts as empty. Recovery steps may be a numbered list on following indented lines; at least one non-placeholder step fills the field. It computes the floor from the PR's changed paths (the API file list or a diff against the merge base) matched against the map's path selectors, and takes the highest. It fails when the declared class is below that floor unless Classification change (or old Class-Change) records the lowering. From the effective class (the higher of declared and floor), Repair and above need Recovery steps (or Put-right), and Migrate and Answer need Responsible for recovery (or Accountable person / Answerer). It prints the floor and the entries that matched. Bot update PRs stay exempt from body fields; their grouped update still passes the local suite through `scripts/deps-land` (CI-41). PR body or boundary-map changes invalidate prior Decision4 evidence and require validation again.
- **CI-27: Changes to `boundary-map.yaml` need the owner's review.** List it in the code-owners file and require that review. Changing the map is a recorded Repair decision; nothing lowers a class below its floor except a recorded map change.
- **CI-28: The sdlc tool's adopt step installs the review and PR files** (`REVIEW.md`, code-owners file, review workflows, PR template). The blueprint adds the Decision4 sections and the local `decision4` validation on top; there is one way, not two copies (see [sdlc](sdlc.md), [agent-files](agent-files.md)).
- **CI-29: A solo-owner repo cannot require approving reviews,** because an author cannot approve their own PR and every merge would block. Protect the gates by the required checks, the code-owners listing and the self-covering map entry (STR-28), not by a review count.
- **CI-20: Squash merge, with a Conventional Commit title.** The title decides the release type (see [release-and-deploy](release-and-deploy.md)). One change per PR.
- **CI-21: Arm auto-merge on every PR that can merge on green.** Hand a PR to the owner only when it needs a human judgment. Check the merge state (behind, blocked, clean) before saying it is ready; green checks are not the same as mergeable.
- **CI-22: Branch from a freshly fetched default branch,** never from a stale local copy.
- **CI-33: `arch` and `perf` are separate steps in the local gate,** next to `slop`. `arch` runs boundaries and score dimensions using the stack's tools; `perf` runs applicable web and bundle budgets. Each reports its own failure and deltas, or "not applicable". See [architecture](architecture.md).
- **CI-24: Slop is a separate step in the local gate.** It runs the `slop` target: vendored anti-slop rules through Oxlint for TypeScript, plus separate metric collectors compared with the merge base. Biome stays in `lint` and `format-check`; it cannot run the Oxlint JavaScript plugins. Report slop failures and metric deltas separately.

### Local verification and cheap remote work

- **CI-34: `scripts/ci-local` owns the local-first gate.** A pre-push hook invokes it; direct invocation runs the full local suite for the first push of a change, validates Decision4 against the changed paths and PR body, pushes the verified commit, then posts `local-ci` and `decision4` commit statuses for that exact SHA. Use a recursion guard when the script pushes through the hook; an ordinary push must pass the same gate. Any edit, new commit, rebase or merge invalidates the previous result. The script must fail closed on dirty or moved heads, failed checks, push failures or status-publication failures. Never post these statuses by hand or copy them from another SHA. For an initial PR, validate the proposed body locally, then create the PR after the branch push and validate its actual body before Decision4 can report success. Audit that the ruleset actually requires both statuses (CI-30); writing this rule does not install the gate.
- **CI-35: Debug locally before every push.** Never push to "see what CI says". Read exactly which job or test failed and why, reproduce that test locally, fix it, then rerun only failing tests plus the directly affected suite until green. For an e2e change, run that spec and its neighbours locally. Then run the full local gate once before pushing, batching fixes into one push. Never rerun a whole pipeline to retry one failed or flaky test, and never push a speculative fix. Existing remote CI confirms the local result; waiting on GitHub for feedback a local run could give is a process defect. See [testing](testing.md) TEST-21.
- **CI-36: GitHub runs only work that needs GitHub or the cloud.** Deploys, previews, Terraform plans, comments, labels and scheduled jobs qualify. Format, lint, typecheck, tests and local builds belong in CI-34. Do not run full CI again on main after a PR already passed; deployment may build and scan its immutable release artifact, without repeating the verification suite.
- **CI-37: Use the cheapest runner that works.** `ubuntu-slim` is a 1-vCPU runner at $0.002/min for short, light jobs such as comments, labels, a transitional remote Decision4 check and small scripts. Use the 2-core `ubuntu-latest` tier for builds where that is the allocated tier; public repositories can receive a larger standard allocation. Standard GitHub-hosted runners in public repositories are free. macOS runners are only for Apple app release builds, triggered by a tag or manual dispatch, never every push or PR. Runner capacities and prices are checked against the dated [sources](sources.md) entry before choosing; do not pin an OS or language version in this rule.
- **CI-38: Share setup within one job per stack where possible.** Install once, run sequential named steps and report each result. Billable minutes round up per job, so many tiny jobs repeat setup and rounding. Use separate jobs only when isolation or a measured wall-clock improvement justifies them. Keep lint, slop, arch and perf as distinct steps, not mandatory separate runners.
- **CI-39: Avoid superseded and irrelevant runs.** PR workflows use concurrency keyed by workflow and PR with `cancel-in-progress: true`, plus path filters for the work they actually do. A required status must still report when paths are skipped; do not filter its entire workflow away. Deploys and cleanup that must serialize use their own concurrency groups with `cancel-in-progress: false`.
- **CI-40: Dependabot batches routine work monthly.** Per ecosystem set `schedule.interval: monthly`, `open-pull-requests-limit: 3` and a group with `patterns: ["*"]` and `update-types: [minor, patch]`, yielding one routine PR per ecosystem. Keep major updates separate for review. Define a second group with `applies-to: security-updates` and `patterns: ["*"]`, and enable security updates so grouped fixes arrive immediately, outside the monthly routine schedule. The version-update limit does not cap security PRs. See the configuration reference in [sources](sources.md).
- **CI-41: `scripts/deps-land` lands a grouped dependency PR.** Check out the grouped PR's exact head, inspect its changes, run `scripts/ci-local` to publish the gate's evidence, then merge only after all required statuses and the merge state are green. If rebasing changes the head, rerun the gate. The command never manufactures successful statuses or merges unverified bot PRs.

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
  - `migrate`: apply migrations. `docker-build`: build the image.
  - `help` is the default goal and lists every target with its one-line description.
  Each stack maps these names to its own tools; the names stay fixed. Agent files name these targets, not raw tool commands.

```make
check: format-check lint slop typecheck test test-integration arch perf gates-test  ## full local verification suite
```

## How to apply

1. Create the Make contract and full local `check`, then implement `scripts/ci-local`, its pre-push hook and exact-SHA status publication (CI-34).
2. Add scanners, Decision4 validation, its negative fixtures and the PR fields. Install review and owner files through the sdlc adopt step; verify the local gate is implemented rather than assuming adoption installs it.
3. Apply rulesets requiring `local-ci` and `decision4`, enable squash merge and auto-merge, and verify enforcement on default and interior branches.
4. Add only necessary remote workflows, using CI-37 through CI-39, and skip bot and draft previews ([release-and-deploy](release-and-deploy.md) REL-20).
5. Configure monthly grouped dependency updates and `scripts/deps-land`; add new guard tests to the local gate in the same PR.

## Checks

- Automatic: action SHA pins, timeouts and least privilege; applicable paths and concurrency; no redundant main verification run or per-PR macOS build.
- Automatic: the local gate and hook reject failed checks, dirty or moved heads and failed status publication; both required statuses refer to the verified head.
- Automatic: Decision4 fixtures pass; the code-owners file lists the boundary map; every Make target exists; arch, perf, slop and guard tests feed the local gate.
- Automatic: Dependabot routine and security groups, monthly schedule and PR limit; `scripts/deps-land` reruns the gate after a changed head.
- Review: CI-30 enforcement rows distinguish documentation from installed and applied gates; monthly audit is current; preview eligibility and serialization are correct.

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
