---
name: architecture
description: The architecture description file (architecture.yaml) and the fitness dimensions that turn it into CI checks with scores, a baseline ratchet and a report.
read-when: writing the STR-3 policy file, adding a fitness check (boundaries, score, slop, performance, bundle size), or wiring the fitness target and enforcement rows.
skip-when: changing copy, styling or content that touches no module, boundary or budget.
---

# Architecture

A product describes its own architecture as data, and every property that matters is a check that reads that data. The one idea: a fitness function is a CI check over an architecture description, so a boundary, a score or a budget is a number a PR can break, not a sentence a reviewer must remember. The idea comes from entrix and from the book on evolutionary architecture (see [sources](sources.md)).

## Rules

### The description

- **ARCH-1 `architecture.yaml` at the repo root is the STR-3 policy file.** It lists modules, their doors, their allowed edges, the tables they own and the shared leaves. It is the single source the boundary checks, the module tests and the agent files read; none keeps its own copy of the module list. See [structure](structure.md).
- **ARCH-2 Every module is one entry.** Name, path, door (STR-2), `may_depend_on` (STR-3, one way, no cycles) and `owns_tables` (STR-11). Read exceptions (STR-11) are entries too: one file, one table, a reason.
- **ARCH-3 Shared leaves are listed apart from modules.** `shared`, `ui`, `i18n` and `clients` import no module (STR-18 to STR-21); a client may name `shared` as an edge and nothing else.
- **ARCH-4 The file is changed on purpose.** A new edge or exception carries a reason beside it. Editing it to make a check pass, without the reason, is a defect (see structure, mistakes to avoid).

```text
architecture.yaml
  version
  modules[]        name, path, door, may_depend_on[], owns_tables[]
  shared[]         name, path, may_depend_on[]            (leaves)
  exceptions[]     file, table, reason                    (STR-11 reads)
  fitness[]        id, target, tool, gate                 (ARCH-5)
                   budgets or key pages where the gate needs them
  enforcement[]    per fitness id: checker, invoked by, required, applied   (ARCH-15)
```

### Fitness dimensions

- **ARCH-5 Every dimension is a row under `fitness`, and every row is a CI check.** It names an id, the make target that runs it (the Make contract in [ci](ci.md)), the tool and the gate. A dimension with no check is not listed; a check with no row is not trusted.
- **ARCH-6 `arch.boundaries`: imports go only through doors, along declared edges, with no cycles.** Tool: ArchUnitTS for TypeScript, import-linter for Python, the per-stack equivalent otherwise. Gate: zero violations, or no more than the baseline and never rising.
- **ARCH-7 `arch.score`: a number for the whole graph.** Score = 100 x (1 - violating edges / all cross-module edges). For TypeScript, a project calculation derives this blueprint-defined score from the same dependency graph and violations checked by ArchUnitTS. A cycle is a hard fail, not a point off. Gate: score at least 90 and at least the score of the merge base, so a PR can neither dip under the floor nor erode a better score.
- **ARCH-8 `quality.slop` points to code quality.** The anti-slop rules and the slop metrics are defined in [code-quality](code-quality.md) (CQ-12 to CQ-23) and run as the `slop` job (CI-24). This row only registers them as a dimension; it does not restate their thresholds.
- **ARCH-9 `perf.web`, for products with pages.** Lighthouse CI against the PR preview URL; when there is no preview, against a production build served locally (never the dev server, see [testing](testing.md) TEST-10). Gate on the key pages listed in the file: performance at least 90, largest contentful paint at most 2500 ms, layout shift at most 0.1, total blocking time at most 200 ms. Pages are listed by route, not discovered.
- **ARCH-10 `perf.bundle`, for web apps, extensions and published packages.** A size budget tool (size-limit or equivalent) with a gzip budget per entry written in the file. A PR may not exceed a budget; raising one is a change to the file with a reason (ARCH-4).
- **ARCH-11 `decision4` is a dimension too.** Its gate is CI-26 ([ci](ci.md)); the row exists so the report and the enforcement audit see it with the others.

### Ratchet and report

- **ARCH-12 Existing violations go in a committed baseline that only shrinks.** One line per finding, for example `.fitness/baseline.json` ([structure](structure.md) quality ratchet, CQ-21). A new gate ships with its baseline in the same PR: baseline first, gate second, both in one change, so main never turns red. A greenfield product starts with an empty baseline.
- **ARCH-13 A `fitness` target runs every dimension and writes `fitness-report.json`.** One entry per id: value, threshold, baseline, pass. CI posts the deltas on the PR. The target is part of the Make contract and feeds the required summary through the `arch` and `perf` jobs, not as a second pipeline.
- **ARCH-14 A dimension that does not apply prints "not applicable" and exits 0** (CI-23). A repo uses the dimensions that fit its stack and never invents a score to fill a row.

| Stack | Fits | Not applicable |
| --- | --- | --- |
| Web app | boundaries, score, slop, web, bundle, decision4 | none |
| API or worker | boundaries, score, slop, decision4 | web, bundle |
| Browser extension | boundaries, score, slop, bundle, decision4 | web |
| Published package | boundaries, score, slop, bundle, decision4 | web |
| Swift app | complexity and clone metrics (lizard, jscpd), app size, decision4 | web, bundle, import graph unless the tool supports it |
| Terraform | scanner findings (tfsec or equivalent), module graph, decision4 | web, bundle, score |
| Docs only | decision4 | everything else |

### Enforcement rows

- **ARCH-15 Each fitness id has an enforcement row** the audit reads (CI-30): the checker, what invokes it (job or hook), whether its status is required, and whether it is applied (in the required summary and the repo ruleset). They live under the id in `architecture.yaml`, or in a sibling `enforcement.yaml`.
- **ARCH-16 The audit reports four states per row.** Installed (the tool resolves), configured (its config file exists), executed (a job in a workflow runs it and feeds the summary), passed (the last default-branch run was green, read from the code host when a token is present, otherwise "unknown"). It runs as a non-blocking report on PRs and as the monthly workflow of CI-31, which opens or updates one issue on gaps.

## How to apply

1. Write `architecture.yaml` with the modules the product has now. An empty module list is fine on day one. Add the `fitness` rows that fit the stack and mark the rest "not applicable".
2. Generate the baseline from today's code, then switch on `arch.boundaries` and `arch.score` in the same PR. Commit the baseline.
3. Add `perf.web` and `perf.bundle` where they apply, with the key pages and budgets written in the file. Measure once, set budgets at or just above today's value, and let the ratchet do the rest.
4. Add the `fitness` target and `fitness-report.json`. Add the `arch` and `perf` jobs next to `slop`, both in the required summary ([ci](ci.md)).
5. Add negative fixtures for each gate ([testing](testing.md) TEST-19) and the `gates-test` target, then the enforcement rows and the audit.
6. Changing later: a new edge, exception, budget or page goes through the file with a reason. A tool upgrade that changes detection goes in its own PR that regenerates the baseline.

## Checks

- Automatic, in the required job: `architecture.yaml` parses and matches the folders; every path, door and table it names exists; `arch.boundaries` and `arch.score` pass; budgets hold; `fitness-report.json` is written and every row has a value.
- Automatic: each gate fails on its deliberate-violation fixture and passes on its good fixture (TEST-19).
- Automatic: every fitness id has an enforcement row, and the audit shows installed, configured, executed and passed for it.
- Review: whether a new edge is a real dependency or two modules that should be one, whether a budget was raised for a reason, whether a "not applicable" row is honest.

## Mistakes to avoid

- A score gate with no floor, so a graph at 40 passes because it did not drop.
- A floor with no merge-base comparison, so a graph at 99 can slide to 90 unnoticed.
- Switching on a gate without its baseline, so main turns red and the gate is switched off again.
- Lighthouse run against the dev server, or against pages found by crawling instead of listed.
- A bundle budget raised in the same PR that broke it, with no reason.
- A fitness row with no enforcement row, so nobody knows whether the job is required.
- A made-up score for a stack where the dimension does not apply.
- Two module lists, one in `architecture.yaml` and one in the lint config, that drift apart.
