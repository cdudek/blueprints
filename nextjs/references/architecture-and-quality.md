---
name: nextjs-architecture-and-quality
description: ArchUnitTS over architecture.yaml, TypeScript semantic guards, Biome and the anti-slop lint boundary
read-when: setting up checks, adding a module or dependency, changing an architecture rule or adopting an existing app
skip-when: changing content within an already enforced boundary
---

# Architecture and quality

Apply [core architecture](../../core/references/architecture.md), [code quality](../../core/references/code-quality.md) and [CI](../../core/references/ci.md). This stack chooses the TypeScript tools; core still owns the scores, ratchets, fitness report, enforcement rows and required summary.

## Rules

- **NEXT-ARCH-1 ArchUnitTS is the boundary engine.** Use [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) (the `archunit` package) for TypeScript dependency and cycle checks, with `architecture.yaml` as the only policy source. This specializes core ARCH-6. Do not install dependency-cruiser or keep a parallel JSON module policy. Read the installed ArchUnitTS API before implementing the runner.
- **NEXT-ARCH-2 Resolve the actual TypeScript project.** Include TS and TSX, path aliases, project references, dynamic literal imports, re-exports and type-only imports. Include app, modules, clients, shared, UI and framework entry files in the policy. An unreadable config, unresolved local edge, missing declared door or empty selection fails closed. Test file-level and module-level cycles, including cycles through re-export chains. Type-only edges still obey module ownership; runtime server-leak checks distinguish them.
- **NEXT-ARCH-3 Import checks are supplemented by semantic guards.** Use the TypeScript compiler AST and resolved graph for rules that import edges cannot prove. Keep these guards in the same architecture test suite, reading the same policy. Do not claim that a package import rule can prove transaction use or resource authorization.

| Check family | Required proof in the product |
| --- | --- |
| Doors and edges | Named exports, no private persistence exports, no own-door imports, declared directions and no cycles |
| Runtime closures | No client entry or public door reaches server code, secrets or Node-only providers; no door-level client directive |
| Ownership | Tables and schema composition match owners; read exceptions match one file and table; no database queries in delivery or UI |
| Pure rules and shared leaves | No framework, database, network, ambient time or randomness in rules; no business import in shared leaves |
| Operations and transactions | Declared access, system operations reachable only from system entry paths, no nested transaction or external call in a transaction |
| Composition and UI | One provider composition, one icon door, component placement, tokens and global CSS owners |

- **NEXT-ARCH-4 Diagnostics identify the rule and occurrence.** Each finding carries rule ID, source, target and location where available. Prove every gate with a permitted case and a deliberate violation; include transitive leaks, re-export cycles, alias bypasses, a missing project reference and a policy that selects no files. Existing debt uses core's merge-base shrinking baseline and reviewed rename procedure. Server or secret leaks are never baselined.
- **NEXT-ARCH-5 Biome owns formatting and ordinary lint.** It formats and lints product TypeScript, TSX and the supported config files. Oxlint runs only the vendored anti-slop ruleset in a separate core `slop` target, with ordinary built-in rule sets disabled so it does not become a second general linter. This specializes core STK-21; retain core's slop metrics and thresholds. No parallel ESLint policy or formatting tool for the same source files.
- **NEXT-ARCH-6 Typecheck and build prove different things.** Strict TypeScript covers app, tests, scripts, stories and config, using separate project configs when their runtimes differ. Typecheck alone cannot catch Next.js action export restrictions or every server/client violation; the verify command includes a production build. Knip and duplication checks retain core's unused-code and shrinking-debt rules, with framework conventions explicitly declared as entries rather than broadly ignored.

## How to apply

Write `architecture.yaml` with real paths, named server and public doors, allowed edges and table owners. Register ArchUnitTS and the semantic suite under `arch.boundaries` and `arch.score`; both read the same resolved graph. Keep the score definition, merge-base comparison and cycle hard failure from core, documenting the no-cross-module-edge case rather than dividing by zero.

Wire format, lint, typecheck, tests, architecture, slop, build and fitness into the product's one verify command and required CI summary. An editor integration may consume the same policy, but does not replace CI. Generate diagrams from that graph when useful; do not maintain another module list by hand.

Changing later: add the failing fixture before changing a checker. A tool upgrade that changes findings is a separate baseline migration. Baselines compare stable occurrence identities; unexplained moves or a parse error cannot admit new debt.

## Checks

- Automatic: every declared path exists, all production files belong to a policy area, architecture fixtures fail for their intended rule, baseline additions fail, score and budgets feed core's fitness report and required summary.
- Automatic: Biome, strict typecheck, scoped anti-slop, unused-code and duplication gates run on their actual inputs; a real production build completes.
- Review: raw SQL writes, indirect external calls, transaction parameter use, resource permissions and whether a module owns a coherent capability. These remain review obligations even when the graph is green.

## Mistakes to avoid

- Keeping the boundary engine's own allowlist beside `architecture.yaml`.
- A broad baseline glob that excuses future files or a detector that omits TSX.
- Reducing the typecheck scope until it passes, or using lint to claim a framework build succeeded.
