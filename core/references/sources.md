---
name: sources
description: The registry of every external source the blueprint relies on, with its pinned version, what we take, its licence and how it is tracked.
read-when: citing an outside source, adding or updating one, or when a Renovate PR proposes a new tag of a source.
skip-when: you are building product code and the references already tell you what to do.
---

# Sources

The blueprint restates outside work in its own words and says where it came from. The one idea: every source is pinned, so a change upstream reaches the blueprint as a deliberate change, never by drift.

## Rules

- **SRC-1 Restate, do not copy.** Write the idea in our own words and cite the source. The exception is a text the source asks to be pasted verbatim, such as the Decision4 handoff contract (AGENT-23), which carries its attribution line.
- **SRC-2 Credit what the licence requires.** For Decision4: "Decision4 by Habitat Thinking, CC BY 4.0", with a link to the tagged document. For MIT sources, keep the licence text with any vendored file.
- **SRC-3 Pin every source.** A tag, a commit or a date. Library and standard versions stay out of the other references; this file is where a version may appear.
- **SRC-4 Follow minors and patches, review majors.** A new minor or patch is read and adopted in a normal PR. A new major is an ADR-level blueprint change: a class-aware record (see [decisions](decisions.md)) before the blueprint moves.
- **SRC-5 Renovate watches tagged sources.** A line marked with a `<!-- renovate: datasource=github-tags depName=<owner/repo> -->` comment, followed by its version, gets a PR when a new tag appears. Sources without tags (a commit, a date) are re-checked by hand when their reference is next edited.
- **SRC-6 One entry per source.** Each entry has URL, pinned version, what we take, licence, tracking. A reference that cites a source not listed here is incomplete.

## Registry

### Decision4

- **URL:** https://github.com/Habitat-Thinking/decision4
- **Pinned:** v1 (follow minors); current tag below.
- **Takes:** the question, the four classes, the three rules, the handoff contract, annotation fields, class-aware records, the boundary map and its schema. See [compatibility](compatibility.md), [decisions](decisions.md), [agent-files](agent-files.md), [ci](ci.md), [structure](structure.md).
- **Licence:** text CC BY 4.0, schema and examples MIT.
- **Tracking:** Renovate on the tag; a new major is an ADR-level change.

<!-- renovate: datasource=github-tags depName=Habitat-Thinking/decision4 -->
Decision4 v1.0.1

Credit: Decision4 by Habitat Thinking, CC BY 4.0. [DECISION4.md v1.0.1](https://github.com/Habitat-Thinking/decision4/blob/v1.0.1/DECISION4.md).

### cct (Calvin's Claude Tools)

- **URL:** https://github.com/cdudek/calvins-claude-tools
- **Pinned version:** the marketplace ref a product declares in `.claude/settings.json` (AGENT-26); latest `main` when none is set.
- **What we take:** the tooling that applies this blueprint: `project-setup`, `sdlc-run`, the UX suite, `project-kickoff`. The blueprint says what; cct does it.
- **Licence:** the owner's own.
- **Tracking:** the owner releases cct; products update with `claude plugin update cct@cct`.

### spec-kit

- **URL:** https://github.com/github/spec-kit
- **Pinned:** 1.3.2 (2026-11-06).
- **Takes:** ideas only, restated: rule IDs as a constitution with a justified-violations table, coverage table, read-only analyze, converge, requirements checklist, budgeted clarify, stage purity, context packs, bug lifecycle. It is the alternative tool to the owner's sdlc-run skill. See [sdlc](sdlc.md).
- **Licence:** MIT.
- **Tracking:** Renovate on the tag; a new major is an ADR-level change.

<!-- renovate: datasource=github-tags depName=github/spec-kit -->
spec-kit v1.3.2

### ai-literacy-superpowers

- **URL:** https://github.com/Habitat-Thinking/ai-literacy-superpowers
- **Pinned:** 0.92.0, commit a50b8136e8e170a828b7a61aa3e8815475b56bc9.
- **Takes:** ideas only, restated: adversarial pass before the plan gate, enforcement audit with separate installed, configured, executed and passed states, monthly independent harness audit, negative fixtures and layered agent-tooling tests, CUPID review questions, per-change metrics and reflection, subsystem mapping pilot, pitfall hygiene. See [sdlc](sdlc.md), [ci](ci.md), [testing](testing.md).
- **Skips:** the orchestrator, integration agent, auto-enforcer, the HARNESS.md master file, badges, the 81 observatory signals and session sentinels.
- **Licence:** Apache-2.0.
- **Tracking:** commit pin; manual re-check.

### anti-slop

- **URL:** https://github.com/dmmulroy/anti-slop
- **Pinned:** commit 13909c9e07590f5a85d93c62712259fe14a883f7 (HEAD of main when recorded, 2026-11-07).
- **Takes:** lint rules against low-evidence code, vendored into the product. See [code-quality](code-quality.md).
- **Licence:** MIT.
- **Tracking:** manual. Re-check when code-quality is edited; a rule change goes in its own PR.

### SlopCodeBench

- **URL:** https://arxiv.org/abs/2603.24755
- **Pinned:** arXiv 2603.24755v1.
- **Takes:** the erosion and verbosity metrics behind the slop metrics. See [code-quality](code-quality.md).
- **Licence:** see the paper's arXiv listing; we cite, we do not copy.
- **Tracking:** manual. A later version is read before the metrics change.

### Model Context Protocol specification

- **URL:** https://modelcontextprotocol.io/specification/
- **Pinned:** revision 2026-07-28 (latest dated revision at build time).
- **Takes:** transport, tools, authorization. See [mcp](mcp.md).
- **Licence:** open specification; see the repository's licence file.
- **Tracking:** manual. A new dated revision is read before the MCP layer changes.

### Laws of UX

- **URL:** https://lawsofux.com/
- **Pinned:** the 30 laws, latest at build time.
- **Takes:** the design gate. See [ux](ux.md).
- **Licence:** site content; cite and restate.
- **Tracking:** manual.

### WCAG 2.2

- **URL:** https://www.w3.org/TR/WCAG22/
- **Pinned:** WCAG 2.2, level AA.
- **Takes:** the accessibility baseline. See [design](design.md).
- **Licence:** W3C document licence; cite and restate.
- **Tracking:** manual. A new version is a major.

### schema.org

- **URL:** https://schema.org/
- **Pinned:** latest at build time; types used are validated in CI.
- **Takes:** JSON-LD types for public pages. See [seo](seo.md).
- **Licence:** CC BY-SA 3.0 for the vocabulary.
- **Tracking:** manual.

### Conventional Commits

- **URL:** https://www.conventionalcommits.org/
- **Pinned:** 1.0.0.
- **Takes:** the PR title format that decides the release type. See [ci](ci.md).
- **Licence:** CC BY 3.0.
- **Tracking:** manual.

### Semantic Versioning

- **URL:** https://semver.org/
- **Pinned:** 2.0.0.
- **Takes:** the meaning of major, minor and patch. See [release-and-deploy](release-and-deploy.md).
- **Licence:** CC BY 3.0.
- **Tracking:** manual.

## How to apply

1. Adding a source: add its entry here first, then cite it from the reference that uses it.
2. A Renovate PR for Decision4: read the tag's changelog, update the pinned lines in agent-files, ci and structure, and merge. A major tag: stop and write the record.
3. Check the licence line before pasting any text.

## Checks

- Automatic: Renovate runs on this file; a test confirms every source linked from a reference has an entry here.
- Review: whether a new source is restated or copied.

## Mistakes to avoid

- Pinning a branch name, so the source changed under the blueprint.
- Pasting a definition instead of restating it, and dropping the attribution.
- Adopting a new major because the bot opened a PR.
