---
name: fastapi-architecture-checks
description: Python import-linter contracts, AST and reflection checks driven by architecture.yaml
read-when: writing architecture policy, adding a module, adopting a baseline or changing an enforcement check
skip-when: the change touches no boundary or gate
---

# Architecture checks

Core [architecture](../../core/references/architecture.md) defines `architecture.yaml`, fitness dimensions, enforcement rows and score/ratchet gates. Core [structure](../../core/references/structure.md) defines the boundaries. Use import-linter as the Python import-graph enforcer and pytest AST/reflection checks for evidence the graph cannot supply.

## Rules

- **FARCH-1 Extend the core policy for Python, without a second source of truth.** Add source/import roots, role doors and their permitted callers, pure leaves (`domain/`, module rules and pure shared code), metadata composition roots, infrastructure tables and exact public-route exceptions. Preserve core's module, edge, table-owner and fitness entries. Validate its schema, reject unknown schema versions and reconcile declared packages against discovered files.
- **FARCH-2 Generate import-linter contracts from that policy.** Configure all flat source roots. Use layers for direction, protected contracts for private module files and role doors, and forbidden contracts with indirect checking for pure leaves and framework-free services/repositories. Discover private files recursively so a new subpackage is protected immediately. Detect both file and module cycles. Generated configuration must match the policy in CI. Read the current [import-linter contracts](https://import-linter.readthedocs.io/en/stable/contract_types/) before selecting options.
- **FARCH-3 Use AST checks for syntax, reflection for registered behavior.** AST checks detect environment reads, transaction ownership, known impure calls, door shape, ORM/driver access and migration phases. Reflection checks door exports, decorated operation access declarations, mounted route authentication and SQLAlchemy metadata ownership. Do not treat an empty discovery result as success. Keep schema loading and `db/` infrastructure exemptions narrow and declared.
- **FARCH-4 Never baseline the trust boundary.** Role-door protection, environment access outside `config/`, framework imports into core code and transaction ownership must be fixed before adoption. For other existing import violations, store exact contract/import pairs under core's shrinking baseline. An ignored pair can hide a second occurrence in the same pair; report this limitation. Dynamic imports are review items, not a reason to declare the graph complete.
- **FARCH-5 Policy changes and review gaps are visible output.** Compare against the target branch's merge base and list added allowed edges, public routes, composition roots or role importers, removed restrictions and deleted modules. Accepted exceptions carry the exact finding, reason and date in the product's policy log and ADR where core requires it. A parse, schema, missing-reference or git error fails closed. Print raw SQL call sites and reviewed migration SQL for human review.

## How to apply

```text
architecture.yaml + discovered source tree + shrinking baseline
  -> validate policy and module/table coverage
  -> generate import-linter contracts; compare committed output
  -> check imports + AST + reflection
  -> compute core fitness values; compare merge base; emit report
  -> print review-only sites and policy changes
```

The checks have different limits:

| Evidence | Tool | Still needs review |
| --- | --- | --- |
| Doors, declared edges, cycles, indirect forbidden imports | import-linter and graph analysis | `importlib`, string imports and runtime plugins |
| Only service gateways open unit transactions; repositories never commit | AST plus nesting/rollback behavior tests | raw SQL transaction commands and indirect aliases |
| No external call in a transaction; pure decisions | import graph and AST | calls hidden behind helpers or unlisted I/O libraries |
| One table owner and no foreign model access | metadata reflection and import checks | raw SQL reading or writing another module's table |
| Auth required or an exact public exception | mounted-route reflection | authorization inside the operation |
| Expand-only revision syntax | Alembic AST checks | effects and lock duration of SQL text |

New product: start with an empty baseline and add negative fixtures with each checker. Existing product: inventory modules and tables, run checks without ignores, fix never-baselinable findings, then freeze the remaining exact findings in the same change that enables the gate. Do not add a second graph tool with a second policy merely to rename the same checks.

## Checks

Automatic: generated-policy drift, new files and nested packages, door exports and role access, table-owner completeness, cycles, baseline additions, malformed policy and unavailable merge base all have bad and good fixtures. Gates feed the core `arch`/`fitness` targets and required summary. Review: each gap in the table, semantic module ownership and whether an accepted exception weakens a real boundary.
