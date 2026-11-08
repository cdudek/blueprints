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
