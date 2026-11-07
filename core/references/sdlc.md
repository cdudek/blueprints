---
name: sdlc
description: Tool-neutral requirements on the per-change process: change folder, budgeted clarify, stage purity, facts and checks, analyze pass, human gate, build, converge, bug lifecycle.
read-when: starting or changing any non-trivial change, choosing or adopting the tool that runs the per-change process, or a change reached build with unclear facts.
skip-when: the work is a typo or copy tweak that needs no change folder (see decisions).
---

# SDLC

Every change runs through a process that turns the owner's words into locked, testable facts before code is written, and proves them after. The idea: this file says what any such process must do; a tool does it. The default tool is the owner's sdlc-run skill; GitHub spec-kit is the alternative (see [sources](sources.md)). Both must meet these rules. Folder shape and gates are in [decisions](decisions.md) (DEC-13 to DEC-17); this file adds the stage discipline.

## Rules

### Intake and clarify

- **SDLC-1: One change folder per change** (DEC-13). The tool creates it; no stage writes outside it except the code in build.
- **SDLC-2: Intent holds the owner's asks verbatim, dated, and a Decision4 class.** The class comes from the boundary map (see [compatibility](compatibility.md)) and sets how much record and which gate the change needs.
- **SDLC-3: Clarify is budgeted.** Questions come from a fixed taxonomy: scope, data, UX states, non-functional needs, integration, edge cases, constraints, terminology, completion signals. At most 5 questions, asked one at a time, ranked by impact times uncertainty. Skip any question whose answer would not change build or validation.
- **SDLC-4: Every question carries a recommended answer and why.** The owner can reply "yes" to take it.
- **SDLC-5: Each answer is integrated atomically** into the section it affects, replacing the statement it makes obsolete. Questions left unanswered are listed as deferred, not dropped.

### Stage purity

- **SDLC-6: Each stage has a do-not list.** Intent does not choose a design. Facts do not name files or libraries. Plan does not add scope. Build does not change a locked fact. A stage that needs an out-of-stage change stops and says so.
- **SDLC-7: Make an informed guess instead of asking** when the answer is a reasonable default, and write it under Assumptions. Never ask about things the blueprint already decides.
- **SDLC-8: At most 3 open clarification markers** remain at the gate, and only for choices that change scope, safety or cost.
- **SDLC-9: Every stage ends with a done-when checklist and a fixed completion report:** what changed, what is assumed, what is open, what comes next.

### Facts and checks

- **SDLC-10: Facts are testable sentences,** one claim each. Each cites the ask it serves, an E2E tag that will prove it, and the rule IDs it touches (blueprint and product rules, see [decisions](decisions.md)).
- **SDLC-11: A requirements checklist tests the writing, not the behaviour.** Items ask "is X defined for Y?", never "verify X works". Each is tagged Gap, Ambiguity, Conflict or Assumption. The reviewer owns it; the builder never ticks it. Unchecked items block the build.
- **SDLC-12: Plan runs a rules check twice,** before design and after. It lists the rule IDs the change touches. A plan that violates a rule adds a row to a justified-violations table:

```text
Violation | Why needed | Simpler alternative rejected because
```

  A violation without a justified row is blocked. A conflict with a MUST rule is critical.
- **SDLC-13: The plan names the context each task needs** (SDLC-18) and the check tier (SDLC-19).

### Analyze and gate

- **SDLC-14: A read-only analyze pass runs before the human gate.** Six passes: duplication, ambiguity (vague adjectives, placeholders), underspecification, rule alignment, coverage gaps, inconsistency and terminology drift. Severity is Critical, High, Medium or Low. At most 50 findings, each with a stable ID and a source reference.
- **SDLC-15: Analyze never applies fixes.** It reports and offers; the author applies them and the pass reruns.
- **SDLC-16: Analyze ends with a coverage table:** each requirement to its task and E2E tag. An unmapped requirement and an unmapped task are both findings.
- **SDLC-17: The human gate locks facts and checks together.** It fails while any finding is open, any checklist item is unchecked, or any validation row reads "not met". After the gate a change to a fact needs a `Revisions` line and a new approval (DEC-16).

### Build and close

- **SDLC-18: Builders get context packs:** the task, its facts, the plan excerpt and the rule IDs. Not whole files, not the whole folder. Constraints from the data model or a contract are quoted into the task verbatim.
- **SDLC-19: Checks run by tier.** A feature runs the fast tier: format, lint, slop, typecheck, unit, arch. A milestone runs the full verify command and the deep tier: integration, E2E on a production build, scanners (see [ci](ci.md), [testing](testing.md)).
- **SDLC-20: A converge pass runs at close.** It compares the result with the locked facts and plan. A checked box is not evidence; evidence is a passing test, a screenshot or a diff. Findings are missing, partial, contradicts or unrequested, each with a source reference. Converge appends fix tasks and never rewrites old ones. A run that changes nothing means converged.
- **SDLC-21: Autonomous builds close only up to the class approved at the gate** (AGENT-24). Above it, prepare the hand-back for the class and stop.

### Bugs

- **SDLC-22: A bug has an assessment, a fix and a test,** in that order. The assessment states the reproduction and the verdict. The test fails for the reported reason before the fix (TEST-13).
- **SDLC-23: A bug is "verified" only when the reproduction was actually run** against the fix. Otherwise the verdict is partial or failed. An intake that finds the report invalid or not worth doing is closed as a success, not forced into a fix.

## How to apply

1. Adopt the tool once per product. Its adopt step installs the files it owns (see [agent-files](agent-files.md), [ci](ci.md)); the blueprint adds its sections on top. Do not build a second process beside it.
2. Order per change: intent, clarify, facts and checklist, plan with rules check, analyze, human gate, build by feature, converge at milestone close, PR.
3. Keep the change folder small. Do not add an artifact a rule above does not ask for; more Markdown is not more control.
4. When the tool or a rule here changes, change both in one PR and re-run a sample change.

## Checks

- Automatic: a change folder has intent, facts, plan and checklist before source edits (hook, see [agent-files](agent-files.md)); each fact has an E2E tag and the tag resolves to a test; the coverage table has no unmapped row; the checklist has no unchecked item at the gate.
- Automatic: the PR lists the rule IDs the folder cites (DEC-17).
- Review: whether a question was worth its slot, whether an assumption is safe, whether converge found real gaps or only ticked boxes.

## Mistakes to avoid

- A clarify round of twenty questions, none with a recommended answer, so the owner skipped them.
- Facts written as steps ("add a table"), which no test can fail.
- A checklist item "verify login works", which tests behaviour and gives the reviewer nothing to review.
- An analyze pass that quietly fixed its own findings, so the author never saw them.
- Builders handed the whole folder, who then reworked decisions already locked.
- A checked box taken as proof, with no test behind it.
- A bug marked verified from reading the diff, never from running the reproduction.
- Two process tools in one repo, each with its own folder and gate.
