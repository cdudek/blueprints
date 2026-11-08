---
name: fastapi-quality-gates
description: Ruff, strict mypy, Python slop measurements and Decision4 in the product's verify contract
read-when: configuring Python tooling or CI, changing a quality threshold or adopting an existing codebase
skip-when: the change touches no tool or gate convention
---

# Quality gates

Core [code quality](../../core/references/code-quality.md) CQ-17 maps the evidence rules to Python; CQ-18 to CQ-23 owns the slop metrics and thresholds. Core [CI](../../core/references/ci.md), [decisions](../../core/references/decisions.md) and [architecture](../../core/references/architecture.md) own execution, Decision4 and required fitness reporting. This reference selects the Python tools.

## Rules

- **FQ-1 Ruff is the formatter and linter.** Select stable rule families explicitly with a reason: errors/imports, upgrades, bugbear, security, complexity and function size, async blocking calls, FastAPI, tidy imports, pytest style, unused suppressions, printing, timezone and logging rules. Do not enable `ALL` or preview rules without review. Ban direct environment reads outside `config/` and blocking HTTP clients. `ASYNC` catches known calls; it cannot establish arbitrary library behavior.
- **FQ-2 Mypy runs strict over every executable Python surface.** Include source, tests, product scripts and Alembic, with the Pydantic plugin where supported by the selected stable releases. Deliberate-violation fixtures are narrowly excluded from ordinary lint/types and exercised by their checker tests. Use typed records, `Protocol`, closed unions and boundary parsers; no `Any`, `cast` or `type: ignore` to discard evidence. A justified cast needs a checkable invariant as required by CQ-5.
- **FQ-3 Measure Python slop in its own target.** Use a function complexity/LOC tool such as lizard and a clone detector such as jscpd. Translate the core mass, erosion, hotspot, clone and verbosity definitions directly; do not substitute average complexity. Ruff/AST pattern hits provide the Python verbosity numerator. Compare the same source scope, tool versions and settings at HEAD and the merge base, storing the per-merge report and shrinking hotspot baseline. API/worker web and bundle dimensions are explicitly not applicable (ARCH-14).
- **FQ-4 Ratchet suppressions and policy, not just findings.** Count Python comment tokens for `noqa` and type ignores per file and code; count Ruff per-file ignores and scanner exemptions too. Strings containing those words are not suppressions. Existing suppressions cannot grow silently, and new files do not get a free allowance. Baseline and policy comparisons use semantic entries, with exact, dated reasons for accepted changes and failure on git/parse errors. Handle renames explicitly; they cannot reset debt.
- **FQ-5 Check dependencies and secrets with purpose-built tools.** Deptry checks source and Alembic imports against declared dependencies. A driver/server used by configuration rather than an import has a narrow explained exception. Scan staged changes and repository history for secrets, and use core's dependency/security gates. Pin reproducible tooling in the product; an upgrade that changes detection gets its own baseline review.
- **FQ-6 Python does not change Decision4.** Put the path/key/store/API/environment floors in `boundary-map.yaml` and include the core PR fields. Register `decision4` and `quality.slop` in `architecture.yaml`; make their jobs feed the required summary. A local hook supplements CI, and the job tested on fixtures is the job that actually blocks merging.

## How to apply

Map the core Make targets to product tools; use the same commands locally and in CI:

| Target responsibility | Python choice |
| --- | --- |
| Format and lint | Ruff format/check; deptry; suppression and policy ratchets |
| Typecheck | Mypy strict with the appropriate Pydantic integration |
| Test layers | Pytest unit, integration, contract and tooling suites |
| Architecture and fitness | Import-linter, pytest architecture checks, core report/score adapter |
| Slop | Python pattern checks, lizard/clone metrics against merge base |
| Gates and secrets | Negative fixtures, Decision4, secret/dependency scanners |

New product: implement these targets and hooks before adding features. An existing service freezes only permitted debt, proves each gate fails on a deliberate violation and enables the required CI summary in the same change. A replacement type checker becomes the sole blocking checker only after it passes the product and the negative fixtures without losing findings or requiring suppressions for SQLAlchemy/Pydantic types.

## Checks

Automatic: format, lint, types, all applicable test layers, secret/dependency scans, architecture, slop and Decision4 run in the required pipeline. Negative fixtures cover a lint violation, unsafe typing, metric rise, baseline/suppression growth, renamed debt, disabled strictness and missing/below-floor PR evidence. Review: casts and exceptions carry real evidence, scope does not exclude new code and thresholds were not raised just to pass a feature.
