# Local PR evidence

The shared runner writes the evidence below for every run; it calls no model and posts nothing.
The runner writes `checks.json` in `.git/ci-local/<head>/` with the real exit result and output
digest of each named check. Docs-only changes run only document format and link checks under
CI-4; the other checks are absent from `checks.json`, never recorded as passed. Missing tools,
stale results and edited logs cannot stand in for real execution.

`fitness-report.py` is not called by the runner. Run it by hand when you want a complete
`architecture.yaml` report from `checks.json`.

For CQ-19, copy `complexity-ratchet.py`, declare source paths and exclusion globs in
`.fitness/complexity.json`, and record `.fitness/complexity-baseline.json` from the fetched
base before enabling the gate. Run the script in the `slop` target with
`--base "$CI_LOCAL_BASE_TREE"`. Lizard supplies the exact file/symbol/metric and function
content digest. Baseline rows cannot be added or changed at the same complexity; a changed
hotspot must become simpler. `--record` removes resolved debt and records a reduction only
after comparing it with the old baseline. Empty baselines cannot grow. Tests in the shared
host cover replacement hotspots, same-complexity edits, quoted CSV, reductions and forged
baseline changes against a real base tree.
