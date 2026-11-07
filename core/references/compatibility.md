---
name: compatibility
description: When breaking changes are allowed, the question the agent must ask before one, and how to change schemas, APIs, events, job payloads, MCP tools and URLs without breaking users.
read-when: before any change that removes, renames or re-types something another system, user, stored row, bookmark or running revision depends on.
skip-when: purely additive changes, or a product in the dev phase with a throwaway database.
---

# Compatibility

A product has two phases. In development, break anything freely. Once real users exist, every change is backwards compatible: expand, migrate, contract. The one idea: the agent classifies every change with the Decision4 v1 question (see [sources](sources.md)), knows which phase it is in, and asks before it guesses.

## Rules

### Phases

- **CMP-1 Dev phase.** No real users and no data worth keeping. Rename, drop and rewrite freely. The database may be reset. This is the default for a new product.
- **CMP-2 Live phase.** Real users or real data exist. Starts on the first user outside the team, the first real customer data or the first public launch, whichever comes first. Changes must be compatible with the previous release.
- **CMP-3 The phase is written down.** One line in the agent files (`phase: dev` or `phase: live`, with the date it changed). The owner flips it. The agent never flips it.

### The ask-before-breaking rule

- **CMP-4 Before any breaking change, the agent asks.** Breaking means: removing or renaming a column, table, field, endpoint, event, job payload field, MCP tool or URL; narrowing a type; adding a required input; changing the meaning of a value; adding a constraint that existing rows might violate.
- **CMP-5 Classify first, then ask in these words.** The agent answers the Decision4 question for the change ("If this turns out to be wrong, what does it take to put right?"), takes the class from [boundary-map.yaml](structure.md) (never below its floor), and asks this, then waits for the answer:

  > This change breaks existing behaviour: <what breaks, for whom>. If this turns out wrong, it takes <what it takes to put right>, so I class it <Undo|Repair|Migrate|Answer>. Are we live, and may I break this? If yes, I will do it as a recorded exception and hand back what that class requires (<the hand-back for the class>). If no, I will do it in compatible steps (expand, migrate, contract).

  The hand-back per class: Undo, the result. Repair, the result and a choice story. Migrate, at least two real options (or one stated as forced, with its constraint); the owner chooses. Answer, evidence labelled observed, inferred, asked or unknown, and challenges, with no recommendation.
- **CMP-6 The rule is written in the generated agent files.** The product's canonical agent file carries the rule near the top, under the overriding rules, with the Decision4 contract, the exact question from CMP-5 and the current `phase` line. The other agent file carries it by importing the canonical file (AGENT-1). See [agent-files](agent-files.md). An agent that cannot find the phase line treats the product as live.
- **CMP-7 Silence is not consent.** A "go ahead" on the feature is not a "yes, break it". The agent asks again if the answer did not name the break.

### Expand, migrate, contract

- **CMP-8 Every breaking change in the live phase is three steps over at least two releases.**
  1. Expand: add the new shape next to the old. Nothing is removed. Old code keeps working.
  2. Migrate: move writers and readers to the new shape, backfill data, watch that nothing uses the old shape any more.
  3. Contract: remove the old shape in a later release, after a rollback to the previous release can no longer happen.
- **CMP-9 A rollback never touches the database.** The previous revision must run against the migrated schema. That is why contract waits.
- **CMP-10 Applies to every surface**, with these forms:
  - Schema: add column or table first, dual-write, backfill, switch reads, drop later. A rename is add, copy, switch, drop. See [data-and-migrations](data-and-migrations.md).
  - HTTP APIs: add fields, never remove or re-type them. Deprecate explicitly and name a removal date. Unknown values must not break clients: no closed enums for values an upstream may add.
  - Events and webhooks we emit: add fields, keep the old ones, version the event name for a real break.
  - Job payloads: queued jobs outlive deploys. New code reads old payloads, old code ignores new fields. Version the payload. Drain old jobs before contract.
  - MCP tools: a tool name, its required inputs and its output meaning are a contract. Add tools and optional inputs, never rename or remove silently. Pin names with a snapshot test. See [mcp](mcp.md).
  - URLs: a public URL that ever existed keeps working. A moved page gets a permanent redirect (301 or 308), mapped one to one, and the sitemap lists only the new address. See [seo](seo.md).
  - Stored data shapes: version them. Changing an embedding model means reindexing.
  - Configuration: tolerate the older config when the settings schema changes.
- **CMP-11 Contracts are frozen at v1, then additive.** Once a contract is published (API schema, event, tool set, payload), v1 only grows. A real break is a v2 that runs next to v1 until v1 has no users. Generate API schemas from code and fail CI on unplanned drift.

### Recording a break

- **CMP-12 A deliberate break is an ADR.** Even in the dev phase if the break touches a published contract. Record: what breaks, who is affected, the owner's yes (date and wording), the migration or reset plan, the rollback plan. See [decisions](decisions.md).
- **CMP-13 A pre-launch break on a shared database is still an exception.** "Not live yet" is a reason to skip the ceremony only on a throwaway database. On anything shared, record it.
- **CMP-14 Breaks are announced in the changelog** with the date the old shape stops working.

### Classes

- **CMP-15 Every change is classified before it is made.** Undo, Repair, Migrate or Answer, by the Decision4 question. When unsure, take the higher class. Unmapped ground takes the higher class and is logged as a map gap.
- **CMP-16 In the live phase a breaking change is at least Migrate.** Present two real options: the compatible path (expand, migrate, contract) and the break, or one stated as forced. The owner chooses and the choice is recorded (see [decisions](decisions.md)). In the dev phase the class is read normally; a break on throwaway data is usually Undo or Repair.
- **CMP-17 Floors from the map hold in both phases.** Ground the map marks Answer (production data, credentials, legal pages) never drops below Answer because the product is in dev.
- **CMP-18 Lowering a class is recorded** in the `Class-Change` field of the PR (see [ci](ci.md)), with who lowered it and why. Shortening detection (flags, canaries) is a legitimate way to lower a class.

## How to apply

New product:

1. Add the `phase: dev` line, the Decision4 contract and the CMP-5 question to `CLAUDE.md` and `AGENTS.md` at generation time.
2. Add the Decision4 question and a "breaking changes" section to the PR template: class, breaking yes or no, phase, ADR link (see [ci](ci.md)).
3. Add the checks listed below that fit the surfaces the product has.

Going live:

1. Owner flips `phase: live` and the date. Commit it as its own change.
2. Take a baseline: snapshot the API schema, tool list, event shapes and URL list, so drift is visible.
3. From now on every change follows CMP-8.

Making a change:

1. Check the phase. 2. Classify the change (CMP-15). 3. Decide: breaking or not (CMP-4). 4. If breaking, ask with the CMP-5 wording. 5. If the answer is no, plan expand, migrate, contract as separate PRs and write the contract step into the plan with its earliest date. 6. If yes, write the decision record and proceed.

## Checks

Automatic:

- API schema drift check against the committed snapshot. Removed or re-typed fields fail.
- MCP tool-list snapshot test. Removed or renamed tools fail.
- A redirect test: every URL in the committed URL list answers 200 or a permanent redirect.
- Migration lint flags drops, renames and new not-null columns without a default in the live phase.
- A test reads old-shape job payloads fixtures with the current code.
- PR template fields are required and the `decision4` check passes (see [ci](ci.md)).

Review: whether a change counts as breaking, whether contract is early, whether an ADR exists for each recorded break.

## Mistakes to avoid

- Treating "it is only a rename" as safe. Renames are breaks.
- Dropping the old column in the same release that stops using it. A rollback then fails.
- Going live without flipping the phase, so the agent keeps breaking things freely.
- Asking "may I break this?" without saying what breaks and for whom.
- Changing a queued job payload while old jobs are still in the queue.
- Moving a URL with no redirect and losing indexed pages and inbound links.
- Renaming an MCP tool because the old name was ugly. Clients and saved prompts break.
- Reading a backup as a rollback plan.
- Classing a live-phase break as Undo because the diff is small.
