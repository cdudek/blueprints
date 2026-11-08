---
name: agent-files
description: How a product briefs its coding agents: the root CLAUDE.md and AGENTS.md, scoped files, hooks, working agreements, REVIEW.md and agent safety.
read-when: setting up a new product, changing agent instructions, adding a hook, or an agent repeats a mistake.
skip-when: you are only writing product code and the agent files already say what you need.
---

# Agent files

Every product tells its coding agents how to work through a few short files that live in the repo. The idea: the root file is a map and a list of overriding rules, everything else is reached through it, and anything that must hold is enforced by a hook or a test, not by prose alone.

## Rules

### The root files

- **AGENT-1: One file is canonical, the other points to it.** Write `CLAUDE.md` as the real file and make `AGENTS.md` a few lines that import it (or the reverse). Two full copies drift.
- **AGENT-2: The root file is about one page.** It holds the "read before changing anything" table, the overriding rules, the pitfalls and the verify command. Detail moves to linked documents. When the file grows past a page, move content out, do not drop it.
- **AGENT-3: A "read before changing anything" table comes first.** One row per document with what it decides: `PRODUCT.md`, `DESIGN.md`, `docs/ux/`, `docs/rules.md`, `docs/adr/`, `docs/working-agreements.md`. If a change conflicts with one of them, the document wins or the document changes. It is never quietly ignored.
- **AGENT-4: The few overriding rules sit at the top, each linked to its ADR.** Four to six at most, for example "the user's data is never deleted without confirmation". One of them is always the ask-before-breaking rule from [compatibility](compatibility.md):

```text
Before any breaking change (schema, API, URL, stored data, public contract),
ask the owner exactly: "This change breaks existing behaviour: <what breaks, for whom>. If this turns out wrong, it takes <what it takes to put right>, so I class it <Undo|Repair|Migrate|Answer>. Are we live, and may I break this? If yes, I will do it as a recorded exception and hand back what that class requires (<the hand-back for the class>). If no, I will do it in compatible steps (expand, migrate, contract)."
While the phase line says dev, break freely. Once it says live, only expand,
migrate, contract.
```

- **AGENT-5: Pitfalls are written as "wrong thing, then what to do instead", each traced to its incident.** Example: "Wrong: read the app URL from a localhost default. Instead: fail at startup if it is unset. Cost: every magic-link email carried localhost." Without the incident an agent cannot judge when the rule stops applying.
- **AGENT-6: Name only commands that exist.** The verify command, test command and dev command in the file are the real ones from the repo's package manager or Make targets (see [ci](ci.md)). A command that does not exist makes the agent guess.
- **AGENT-7: The framework may be newer than the model.** Say so in the file: read the framework's bundled docs in the installed package before writing against an API, and trust them over memory.

### Frontmatter and scoped files

- **AGENT-8: Every doc has `read-when` and `skip-when` frontmatter.** An agent decides from two lines whether to open it. This file is an example.
- **AGENT-9: Add a subfolder `CLAUDE.md` (and a matching `AGENTS.md`) next to code that is easy to get wrong.** Typical places: infrastructure, external clients, a module with strict boundaries, workflows. It holds only what is true for that folder: the trigger ("read before touching X"), the invariants, the tests that guard them. It does not repeat the root.
- **AGENT-10: A subsystem with a long gotcha list gets a reference doc with a read-before trigger.** Link it from the root table with the trigger in words ("before adding a paid provider call").

### Owner decisions

- **AGENT-11: `docs/working-agreements.md` holds the owner's standing decisions about how work runs.** Each entry is dated. A changed decision is superseded, not deleted.
- **AGENT-12: The owner's requests are kept verbatim and dated.** Quote the words, then interpret. The intent file of each change starts with them (see [decisions](decisions.md)).
- **AGENT-13: Durable knowledge never lives only in session memory.** If it should survive the session, it goes in a committed file.
- **AGENT-14: Strategy, pricing and audience may live in a separate code-free context repo,** imported by the root file. Use it only when several repos share that context.

### Hooks and review

- **AGENT-28: Agent files teach scannable PR, issue and review text.** Include the bold-label What/Why/Proof layout below and its full example; Before merge is conditional, Decision4 appears only with a boundary map, and Decision record at Repair/Migrate/Answer. Link to CI-19 and preserve repo-specific checklists.

- **AGENT-15: Hooks enforce the process, prose does not.** Wire these: block destructive and out-of-scope commands (force push, schema push, cluster mutation, unapproved dependency change); block reads of secret files; run format and lint on every edit; run verify before the agent may stop; refuse source edits for a change that needs a change folder (DEC-13) until its plan is approved; typo and copy fixes are exempt.
- **AGENT-16: Hooks are tested.** A hook with no test silently stops working. Test that a blocked command is blocked and an allowed one is not.
- **AGENT-17: `REVIEW.md` is the brief for the AI reviewer,** at the repo root. Its content is specified in [ci](ci.md).

### Decision4 in the agent file

- **AGENT-23: AGENTS.md carries the Decision4 handoff contract v1, verbatim, and a source line naming tag v1.0.1. CLAUDE.md imports that block so there is one source.** Paste it unchanged under the overriding rules and label it v1. The product lines of AGENT-24 go directly below it. Do not paraphrase the contract; a later version replaces it whole (see [sources](sources.md)).

```markdown
## Decision4 handoff contract (v1)

For every decision you make, ask: "If this turns out to be wrong,
what does it take to put right?" Take the class from the boundary map.
Classes run from lowest to highest: Undo, Repair, Migrate, Answer.

- Undo (a revert): hand back the result.
- Repair (real work, contained to this team): hand back the result and a
  choice story: Chose / Over / Because / Commits us to.
- Migrate (coordinated change involving other people): hand back at least
  two real options, or one stated as forced with the constraint that forces it.
- Answer (an explanation to someone outside the team with standing to ask,
  because the wrong outcome has reached them and nothing unmakes it): hand back
  evidence labelled observed, inferred, asked or unknown, and your challenges.
  Do not recommend.

Rules:
- Propose a class at or above the map's floor, never below it.
- Unmapped or unsure: take the higher class and log a map gap.
- A change takes the class of its highest decision.
- Escalate freely and say who it pulls in. Never lower a class silently.
- Unattended runs close only Undo. Above Undo, hand back and stop.
```

  Decision4 by Habitat Thinking, CC BY 4.0: [DECISION4.md v1.0.1](https://github.com/Habitat-Thinking/decision4/blob/v1.0.1/DECISION4.md).

- **AGENT-24: Product lines follow the contract.** Three lines, product-specific:
  - Map location: "The boundary map is `boundary-map.yaml` at the repo root; read it before classifying" (see [structure](structure.md)).
  - PR fields: "Every PR uses the template section headed How hard is it to undo this PR after merging?: one selected bold class (Decision-Class), Recovery steps (Put-right; Repair and above), Decision record (Repair choice story, Migrate options, Answer evidence/challenges), Responsible for recovery (Answerer; Migrate and Answer, with a named person for Answer), and Classification change (Class-Change; record any lowering). The old plain or bold-label Decision4 v1 fields remain accepted; if both class forms appear they must agree" (see [ci](ci.md) CI-25/CI-26).
  - Ceiling: "An autonomous run closes only up to the class approved at the plan gate. The default ceiling is Undo. Above it, prepare the handoff and stop."

### Files the sdlc tool installs

- **AGENT-26: The repo declares its workflow plugins.** `.claude/settings.json` lists `extraKnownMarketplaces` (where each plugin comes from, a GitHub repo, optionally pinned to a ref) and `enabledPlugins` (which plugins this repo needs). Opening and trusting the repo offers exactly that set, so no one installs by hand and the repo states its own dependencies. The default set is the owner's `cct` plugin (marketplace `cct`, repo `cdudek/calvins-claude-tools`), which carries the sdlc tool, the UX suite and `project-setup`.
- **AGENT-27: Setup runs in a fixed order and has a drift check.** (a) declare the plugins (AGENT-26), (b) the sdlc tool's adopt step (AGENT-25), (c) the anti-slop install skill for TypeScript ([code-quality](code-quality.md)), (d) the Decision4 contract, PR section, boundary-map scaffold and pinned workflow caller or verified local fetch (AGENT-23, CI-26), (e) a read-only check that all of it is present, run again at session start. `cct`'s `project-setup` skill does this with options (which plugins, a pinned marketplace ref, with or without Decision4, anti-slop, sdlc) and a dry run by default.
- **AGENT-25: The sdlc tool's adopt step installs the process files,** so there is one way: the CLAUDE.md process section, `REVIEW.md`, the code-owners file, the review workflows, the PR template and the process hooks (see [sdlc](sdlc.md)). The blueprint adds its own sections on top (the table of AGENT-3, the overriding rules, the Decision4 contract, pitfalls, secret hooks). Do not write a second copy of what the tool installed.

### Agent safety around secrets

- **AGENT-18: The real boundary is credentials, not rules.** An agent session runs with no cloud credentials, or with a separate identity that can only list secrets, not read their values. Code that runs with a secret can read it, so real values are only used in a context the agent cannot steer. See [env-and-secrets](env-and-secrets.md).
- **AGENT-19: An agent may list and check secrets, and run dry runs.** It may open a PR with a change a tool prepared.
- **AGENT-20: An agent asks a human to set, rotate or retire a secret,** in the human's own terminal with a hidden prompt.
- **AGENT-21: An agent never reads a secret value, prints the environment, reads `.env` files other than `.env.example`,** puts a value in a command, file, log, commit or message, or asks a human to paste one into the conversation. The settings file carries deny rules for these as an accident guard.
- **AGENT-22: Agents use non-interactive flags.** Shell aliases can add prompts that hang the session: use `cp -f`, `mv -f`, `rm -f`, `rm -rf`, `-y` for package managers, `-o BatchMode=yes` for ssh and scp, and `CI=1` or the tool's no-prompt switch for installers.

- **AGENT-28: Only repeated lessons become pitfalls, and stale ones are retired.** A mistake seen once stays in the reflection (SDLC-26). A pitfall whose cause no longer exists is removed in the same PR that removes the cause.

## How to apply

Where the files live:

```text
repo/
  CLAUDE.md                  canonical: map, overriding rules, pitfalls, verify
  AGENTS.md                  a few lines importing CLAUDE.md
  REVIEW.md                  brief for the AI reviewer
  PRODUCT.md  DESIGN.md      what and how it looks
  .claude/
    settings.json            permissions, deny rules, hook wiring
    hooks/                   scripts, each with a test
  docs/
    rules.md  adr/  ux/      see decisions.md and ux.md
    working-agreements.md    dated owner decisions
  infra/CLAUDE.md            scoped: read before touching infrastructure
  src/clients/CLAUDE.md      scoped: how external clients are built and faked
```

0. Run `/cct:project-setup` (AGENT-26, AGENT-27). It declares the plugins, then runs the sdlc tool's adopt step (AGENT-25), anti-slop and Decision4; add the blueprint sections to what it installed.
1. Create `CLAUDE.md` (or extend the installed one) with the table, the overriding rules (including AGENT-4), the Decision4 contract and product lines (AGENT-23, AGENT-24), pitfalls (start empty) and the real verify command. Create `AGENTS.md` that imports it.
2. Create `REVIEW.md`, `docs/working-agreements.md` and the hook scripts; wire them in `.claude/settings.json`.
3. Add frontmatter to every doc as it is written.
4. When a mistake happens twice, add it to the pitfalls with its incident. When a convention changes, search for the old guidance and retire it in the same PR.
5. When the owner states a decision about how work runs, add it to the working agreements with the date, in their words.

## Checks

- Automatic: a test lists every doc and fails if `read-when` or `skip-when` is missing; a test checks each command named in `CLAUDE.md` exists; hook tests run in CI.
- Automatic: the contract block in the canonical file equals the pinned upstream text, and `boundary-map.yaml` is named in it.
- Automatic: the deny rules for secret reads are present in the settings file.
- Review: whether a pitfall has its incident, whether the root file is still about one page.

## Mistakes to avoid

- A verify command named in the agent file that did not exist; agents invented their own.
- A review gate promised in docs while the workflow was absent or disabled.
- Two full copies of the agent file that drifted apart.
- Old delivery guidance left in place after the convention changed, so agents followed both.
- A bypass written in prose ("do not push schema") with no hook, which an agent later ignored.
- Owner decisions kept only in chat memory and lost with the session.
- A paraphrased Decision4 contract that drifted from upstream and lost the "unattended runs close only Undo" line.
- An autonomous run that closed a Migrate change because nobody had set its ceiling.

## Pull requests, issues and PR comments: scannable, never a text blob

- **Order:** `## What` → `## Why` → `## Proof` → `## Before merge` (only while something is open) → the repo's Decision4 section (only with `boundary-map.yaml`) → `## Decision record` (at Repair/Migrate/Answer).
- **Bullets:** Every section is a list; start each bullet with a bold label (`- **Source plan:** 0 adds, 8 updates, 38 destroys.`). Keep one idea per bullet, at most two lines, and no paragraph longer than two sentences. Keep checklist syntax and bold-label the item.
- **Proof:** Name the check and result (`- **Unit tests:** 1,320 passed.`). Put links on the label or result, never a bare URL in prose. Preserve claims and human checklist attestations when restructuring an existing body.
- **Decision4:** When the repo has a boundary map, read it and copy the exact readable section from its PR template. Select its highest applicable class in bold with one colour circle and a sentence explaining recovery; use bold-labelled Recovery steps (numbered for multiple steps), optional Work preserved, Responsible for recovery (a named person at Answer), and Classification change. Keep the Recovery levels legend collapsed. Never author old plain `Decision-Class:` lines.
- **Decision record:** At Repair use Chose / Over / Because / Commits us to. At Migrate use at least two real Options, or one Forced option with its Constraint. At Answer use labelled Evidence and Challenges, with no recommendation. Use `## Decision record`; omit it at Undo.
- **Milestone and review text:** The same layout covers milestone-close PRs, issue bodies and PR comments. Put addressed feedback under What, its rationale under Why and its check results under Proof. A short thread reply can be one bold-labelled bullet; include only applicable sections.
- **Validation:** Validate the proposed body before pushing and the actual body after creation or edits through the repo's Decision4 gate when installed. Use `--body-file`; scannable formatting applies even without Decision4.

Full example (illustrative evidence, not claims to copy):

```markdown
## What

- **Change:** Correct generated agent guidance.

## Why

- **Reason:** Already generated files need team follow-up after the rule changes.

## Proof

- **Contract fixtures:** All cases passed locally.

## How hard is it to undo this PR after merging?

**🟡 Repair** — <who has to put it right and what it takes, concrete>

**Recovery steps**

1. <first step>
2. <next step>

- **Responsible for recovery:** <role; at Answer a named person>
- **Classification change:** None

## Decision record

- **Chose:** <what was decided>
- **Over:** <viable alternative>
- **Because:** <reason>
- **Commits us to:** <what this ties the team to>

<details>
<summary>Recovery levels</summary>

Undo — a revert puts it right
Repair — real work, contained to this team
Migrate — coordinated change involving other people
Answer — someone outside the team with standing to ask is affected, and nothing unmakes it

</details>

🤖 Generated with Codex
```
