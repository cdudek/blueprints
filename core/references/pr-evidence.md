# Local PR evidence

The shared runner supports two optional configuration commands, enabled after their scripts
and failure fixtures are installed in a consumer:

```bash
AI_REVIEW_COMMAND='python3 scripts/ai-review.py'
FITNESS_COMMAND='python3 scripts/fitness-report.py'
```

Copy the corresponding reference scripts from this directory. The report needs PyYAML.
The review needs an authenticated Codex CLI or, if unavailable or logged out, authenticated
Claude. An authenticated review that fails does not trigger a second reviewer. The gate
reads the diff once, records findings, and reuses its head/base receipt. Critical, high or
medium findings block publication; at most five low-severity nits are listed and the rest
are counted. Body edits reuse the review and rerun Decision4 and the complete report.

Pass `CI_LOCAL_PR_BODY` before opening the PR. The reviewer adds or replaces one collapsed
tally in that file; use the resulting file for PR creation. For an existing PR the gate
publishes the tally, validates the actual body and changed paths, then regenerates the
complete report before its Decision4 status can succeed. No Actions review is installed.

The runner writes `checks.json` with the real exit result and output digest of each named
check, and `decision4-result.json` with the exact head, base and body digest. A complete
report contains every `architecture.yaml` fitness id and explicit reasons for stack-level
not-applicable dimensions. Applicable dimensions retain their actual gate output (including
measured values, thresholds and comparisons), its digest and the base identity. Fixture
results, missing tools, stale results and edited logs cannot stand in for real execution.
A dimension's `target` must name its real gate check (`arch`, `slop` or `perf`); a check
named `fitness` or `gates-test` cannot substitute for these results. Keep prerequisite
build/runtime checks in that sequence. Docs-only PRs run only document format, links and Decision4 under CI-4. Their product
dimensions say skipped, with the validated changed-path evidence; that is distinct from
executed/passed and from stack-level not applicable. Mixed/code PRs run the full gate.

For CQ-19, copy `complexity-ratchet.py`, declare source paths and exclusion globs in
`.fitness/complexity.json`, and record `.fitness/complexity-baseline.json` from the fetched
base before enabling the gate. Run the script in the `slop` target with
`--base "$CI_LOCAL_BASE_TREE"`. Lizard supplies the exact file/symbol/metric and function
content digest. Baseline rows cannot be added or changed at the same complexity; a changed
hotspot must become simpler. `--record` removes resolved debt and records a reduction only
after comparing it with the old baseline. Empty baselines cannot grow. Tests in the shared
host cover replacement hotspots, same-complexity edits, quoted CSV, reductions and forged
baseline changes against a real base tree.
