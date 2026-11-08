# Working in blueprints

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

Decision4 by Habitat Thinking, CC BY 4.0; tag v1.0.1, commit `4429f821780655f253a954b2659bf38e7b9d5517`: [canonical definition](https://github.com/Habitat-Thinking/decision4/blob/4429f821780655f253a954b2659bf38e7b9d5517/DECISION4.md).

The map is `boundary-map.yaml`. Read `core/references/ci.md` before changing checks.
Run `bash tests/decision4/run.sh` and `python3 -m unittest discover -s tests/sources -v` before committing or pushing; Python needs PyYAML and jsonschema.
Never read `.env*` files or secret values.

Run `python3 -m unittest discover -s core/tests -v` for changes to the shared local runner or dependency driver.
Before the first branch push, validate a proposed PR body through the shared Decision4 checker; consumers pass its file as `CI_LOCAL_PR_BODY`.
After the exact head passes local-ci and Decision4, arm squash auto-merge only at Undo or Repair and without approval-gated tiers.
Never arm it for `terraform/**`, Terraform workflows or classes above Repair; hand those decisions to the owner.
Check the merge state, rerun the full local gate after a rebase, and batch local fixes into one verified push.

## Decision4 records (§7 and §9)

- **Repair:** Record Chose / Over / Because / Commits us to in the PR.
- **Migrate:** Record Class with put-right, Who answers, Commits us to, and Chosen by: <person>.
  An agent drafts at least two viable options, each with its commitments, or one Forced option with its Constraint; the accountable owner chooses.
- **Answer:** Supply labelled Evidence (observed / inferred / asked / unknown) and Challenges, with no recommendation or ranking; general knowledge is not evidence about the case.
- **Answer record:** Include Title, Status, Context, Decision, Class with put-right, Who answers, Rejected alternative (viable), Provenance, Class history, Commits us to, Last validated, and Revisit when (a condition).
- **Person-authored fields:** Only a person with standing writes Answer Decision and Commits us to; agents leave `<person writes>` placeholders, which fail validation until filled.
- **Timing:** Write the record before approval; record what the agent supplied and what the person chose, and keep it current through revalidation, supersession or retirement.
