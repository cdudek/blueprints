---
name: code-quality
description: Code-level rules against low-evidence code, and the anti-slop lint rules that enforce them in TypeScript
read-when: setting up linting in a new product, adding or changing a lint rule, or reviewing generated code
skip-when: docs-only changes
---

# Code quality

Agents produce code that compiles but hides what it knows: values widened to `unknown`, types asserted back without proof, modules mocked instead of given a real seam. The rule behind this file is simple: code keeps the evidence it has, parses at the boundary, and justifies every place it overrides the type system. In TypeScript products a vendored lint ruleset, [anti-slop](https://github.com/dmmulroy/anti-slop) (MIT), enforces most of it.

## Rules

### Evidence

- **CQ-1 Parse at the boundary, never narrow ad hoc.** Untrusted input (requests, env, files, third-party responses, tool arguments) is parsed once at the edge with a schema (see [structure](structure.md) STR-9). Inside the product, values are typed. No scattered `typeof` checks to find out what something is. Existence probes (is `document` defined) are fine.
- **CQ-2 No `unknown` in contracts.** Function parameters, return types and type aliases do not resolve to `unknown`, `object` or an open dictionary of `unknown`/`any`. Exceptions: the subject of a type predicate, and an error's `cause`.
- **CQ-3 Never widen what you know.** Do not assign a known value to a broader type and lose its keys or shape. Use `satisfies` to check against a type while keeping inference.
- **CQ-4 Never widen then assert back.** Moving a value to `unknown` or a broad record and later asserting the narrow type fabricates evidence. Keep the narrow type, or parse.
- **CQ-5 Every type assertion carries a reason.** A non-const assertion has a comment right above it: `SAFETY: <the invariant that makes this true>`. No chained assertions (`as X as Y`).
- **CQ-6 Typed access, not reflection.** No `Reflect.get` or `Reflect.apply` where a typed property access or call works.

### Tests

- **CQ-7 No module mocking.** Tests do not replace modules (`vi.mock`, `jest.mock` and friends). Dependencies get a real seam: the fake provider of a client ([clients](clients.md)), a passed-in function, or a real Postgres ([testing](testing.md)). A test that needs a module mock is pointing at a missing seam.

### Readability and cost

- **CQ-8 Names say what a thing is**, not its form. No `Shape`, `Data`, `Info` suffixes on locally owned symbols.
- **CQ-9 No accidental quadratic work.** No accumulator copies inside reducers (spread, `concat`, `slice`, `Object.assign({}, acc, ...)`). Mutate a fresh local accumulator and return it. No eager `filter().map()` chains on large arrays where a single pass or a lazy iterator works.
- **CQ-10 Omit fields explicitly.** No `...(cond ? { a } : {})` to drop a field; decide whether the field is absent or `undefined` and write that.
- **CQ-11 Blank lines carry structure.** Blank lines between top-level declarations, around multiline bindings and before control flow. The lint autofix inserts them; the formatter handles the rest.

### The ruleset

- **CQ-12 TypeScript products vendor anti-slop.** Install it with its agent skill (`npx skills add dmmulroy/anti-slop --skill install-anti-slop`, then ask the agent to install anti-slop). It copies the rules into the repo (for example `tools/oxlint/anti-slop/`), adds Oxlint and its plugin package at matching exact versions, enables every generic rule as an error, and validates the result.
- **CQ-13 The vendored rules are ours.** It is not an npm dependency. Read the rules, change them when a rule does not fit, and record every change as an ADR ([decisions](decisions.md)). Update through the same skill ("update anti-slop while preserving local customizations"), never by overwriting the folder.
- **CQ-14 Effect rules only with Effect.** The separate Effect rule group is enabled only in products that depend on Effect.
- **CQ-15 Agent folders and the vendored rules are excluded from linting and formatting.** `.claude/`, `.agents/`, `.codex/` and similar, plus the rules folder itself. Do not ignore every dot-folder.
- **CQ-16 Oxlint runs next to whatever the architecture checks use.** Anti-slop covers code-level evidence; module boundaries come from the architecture checks in [structure](structure.md). Both are in the verify command ([ci](ci.md) CI-1).
- **CQ-17 Python products apply CQ-1 to CQ-10 in spirit** with their own linters and type checker in strict mode. There is no vendored ruleset for Python yet.

## How to apply

1. New TypeScript product: install anti-slop with its skill during step 3 of the build order, before the first feature, so nothing has to be grandfathered.
2. Run lint with fix, then the formatter, then lint again. Commit.
3. Add the lint step to the verify command and the required CI check.
4. Existing product: install it, then freeze today's violations in a baseline that can only shrink ([structure](structure.md) quality ratchet). New code passes every rule.
5. When a rule blocks correct code, fix the code first. If the rule is wrong for this product, change the vendored rule and write the ADR in the same PR. Never disable a rule inline without a `SAFETY`-style reason the reviewer can check.

## Checks

- Automated: Oxlint with every anti-slop generic rule as an error, in the verify command and the required check. The installed ruleset matches its recorded provenance (no silent edits).
- Review: whether a parse happens at the right boundary, whether a `SAFETY` comment states a real invariant, whether a new seam replaces a mock properly. The rules are syntactic and local; they do not follow imported types across files.

## Mistakes to avoid

- `const x = input as unknown as User` to make a type error go away.
- `Record<string, unknown>` as a function contract, so every caller loses type checking.
- `vi.mock("./db")` in a test that should run against a real database.
- Installing anti-slop as a package or pinning it as a fixed dependency, then losing local changes on update.
- Enabling the Effect rules in a product that does not use Effect.
