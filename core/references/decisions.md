---
name: decisions
description: How decisions, rules and changes are recorded: ADRs, Given/When/Then rules with a test, open decisions, and the change folder with human gates before build.
read-when: making a decision with a real alternative, adding or changing a product rule, starting a change, or finding two documents that disagree.
skip-when: the work is a typo, a copy tweak or a change that touches no rule and no decision.
---

# Decisions

A product stays coherent when every decision, rule and change leaves a record an agent can find later. The idea: decisions say why, rules say what must be true and which test proves it, and a change folder says what this piece of work is for before any code is written.

## Rules

### ADRs

- **DEC-1: Write an ADR for any decision with a real alternative.** If someone could reasonably have chosen otherwise, record what was chosen, what was rejected and why. Not for obvious choices.
- **DEC-2: One file per ADR in `docs/adr/`, named `NNNN-short-title.md`.** Frontmatter: `id`, `status` (proposed, accepted, superseded, rejected), `date`, `supersedes`, and `enforces` (the rule ids it backs). Body: context, decision, alternatives rejected, consequences.
- **DEC-3: An accepted ADR is never edited to change its meaning.** A new ADR supersedes it, and the old one gets `status: superseded` and a link to its successor.
- **DEC-4: Keep a generated index at `docs/adr/README.md`.** It lists id, title, status and the rules enforced. Agents read the index first, then open only the ADRs they need. A check fails when the index is stale.
- **DEC-5: Link both ways.** The overriding rules in `CLAUDE.md` link to their ADR; the ADR links to the rule ids.

### Rules with tests

- **DEC-6: Product rules live in `docs/rules.md` as Given / When / Then with a stable id.**

```text
R7 - A deleted item can be restored for 30 days
Given an item the user deleted
When the user opens Trash within 30 days
Then the item is listed with a Restore action
Enforced by: tests/trash.restore.test (or "nothing enforces this yet")
```

- **DEC-7: Every rule names the test that fails when it breaks, or says plainly that nothing does.** A rule with no test is a rule on trust, and the file says so. See [testing](testing.md).
- **DEC-8: Numbers in a rule are measured ones, and the ADR that holds the measurement is named.**
- **DEC-9: Behaviour and its rule ship in one PR.** A new rule describes only what the branch's code does.

### Contradictions and open questions

- **DEC-10: Never resolve a contradiction silently.** When two documents, or a document and the code, disagree, keep both, write a decision record naming the conflict, and ask the owner. Do not pick one and move on.
- **DEC-11: An open decision states the default in force until it is answered.** "Open: captcha on the contact form. Default until decided: rate limit only." Work continues on the default; the answer then supersedes it.
- **DEC-12: A deviation from a shared platform rule cites the ADR it relies on.**

### Change folders

- **DEC-13: Every non-trivial change gets a folder `changes/<date>-<slug>/`.** Typo fixes and copy tweaks do not need one. The folder is the record of the work.
- **DEC-14: The folder holds three documents, written in this order.**
  1. `intent.md`: the owner's asks verbatim and dated, job stories (see [ux](ux.md)), and the success measure.
  2. `facts.md`: testable statements of what will be true after the change, each citing the ask it serves and the test tag that will prove it. Plain language, one claim each.
  3. `plan.md`: where the code goes, the steps or feature PRs, how "done" is checked, and a `Revisions` section for any later departure from the plan.
- **DEC-15: Human gates sit before build.** The owner confirms `intent.md`, then confirms `facts.md` and `plan.md` together. Build starts only after the second gate. A plan that touches data safety, irreversible writes, security or money always needs the owner, never self-approval.
- **DEC-16: After approval the facts are locked.** Changing one needs a line in `Revisions` and a new approval. A fact is ticked only when its named test exists and passes.
- **DEC-17: The PR links the change folder and lists the rule ids it touches.** A change to a screen with no rule ids is a review finding (see [ci](ci.md)).

## How to apply

1. Create `docs/adr/` with an index and the first ADRs for the stack choices this blueprint set already made (record deviations, not the defaults).
2. Create `docs/rules.md` with the overriding rules first, each with its test or "nothing enforces this yet".
3. Add `changes/` and a template for the three documents.
4. For each change: draft intent, wait for the gate; draft facts and plan, wait for the gate; then build.
5. When a decision is made mid-change, write the ADR in the same PR and link it from the plan.

## Checks

- Automatic: ADR frontmatter is valid and every `supersedes` target exists; the index is regenerated and compared; every rule id in `docs/rules.md` that names a test points to a file that exists; every rule id cited in code or PRs exists.
- Automatic: a change folder has the three documents before source edits are allowed (a hook, see [agent-files](agent-files.md)).
- Review: whether a decision really had an alternative, whether a fact is testable, whether a gate was passed by the owner.

## Mistakes to avoid

- Rules in `docs/rules.md` named tests that no longer existed, so the rule was enforced by nothing.
- Two documents that disagreed and an agent that silently followed the newer one.
- An ADR edited after the fact to fit what the code did, which erased the reason.
- A plan approved by the agent that wrote it, for a change that moved money.
- Facts written as implementation steps, which cannot fail a test.
- An open question parked with no default, so each agent chose its own.
