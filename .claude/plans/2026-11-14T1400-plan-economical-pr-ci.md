---
type: plan
status: in-progress
created: 2026-11-14
author: Calvin Dudek
project: blueprints, pokbytes/*, cdudek/snapmark-mac
supersedes: none
---

# Economical PR CI instead of the local push gate

## Why

The local gate (`scripts/ci-local` plus `.githooks/pre-push`) blocks every push until the full
gate passes, so a broken upstream blocks unrelated work. PR CI moved off GitHub Actions on
2026-11-08 because frequent pushes and PRs used up the private Actions minutes (pokbytes is on
the Team plan, 3,000 included minutes a month).

Decision (Calvin, 2026-11-14):

- CI runs in GitHub Actions, but rarely.
- Pushes are free and are never gated.
- The merge is gated by one required check.

## Decisions

- **Trigger:** `ci.yml` runs on `pull_request` only. Every job has
  `if: github.event.pull_request.draft == false`.
  - Event types: opened, synchronize, reopened, ready_for_review.
  - Drafts cost nothing.
  - One concurrency group per PR, with `cancel-in-progress: true`.
  - No CI on push to main.
- **Required check:** one aggregate job named `ci`. It replaces `local-ci` and `decision4` in
  rulesets or branch protection.
- **One source of checks:** `ci.yml` runs `scripts/ci-local --ci`, which runs CHECK_COMMANDS
  minus `LOCAL_ONLY_CHECKS`.
  - The local-only checks are the heavy or costly ones: e2e, docker builds and scans, the macOS
    runtime build.
  - A plain `scripts/ci-local` runs everything locally and costs nothing.
- **ci-local:** it no longer pushes, posts statuses or runs the AI review. The pre-push hook,
  `setup-hooks` and `core.hooksPath` are gone.
- **Decision4:** it stays as an information-only job. It is never required and never fails the PR.
- **AI review:** removed.
- **Dependabot:** runs weekly. Each ecosystem gets one grouped PR, with a cooldown.
- **Agents:** one PR per milestone. Push to a draft, then mark the PR ready once.

## Steps

- [x] 1. blueprints: new runner, `ci.yml` and dependabot templates, decision4 info-only, tests and docs
- [ ] 2. Per repo, one PR each:
  - terraform-infra
  - heapthat
  - samplewerk-app
  - samplewerk-web
  - samplewerk-context
  - heydiff-web
  - heydiff-chrome
  - heydiff-kit
  - heydiff-context
- [ ] 3. heydiff-desktop (cdudek/snapmark-mac): draft guard, concurrency and weekly Dependabot; decision4 becomes information-only
- [ ] 4. Per repo: once `ci` has run green on the PR, rulesets or branch protection require `ci` instead of `local-ci` and `decision4`
- [ ] 5. Merged (Calvin merges; auto mode refuses auto-merge)
