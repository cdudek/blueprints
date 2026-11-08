<!--
Scannable layout: What, Why, Proof, Before merge (only if open), then Decision4
when boundary-map.yaml exists, then Decision record only at Migrate/Answer.
Every section uses lists with bold labels; one idea per bullet, at most two lines.
Proof names each check and result. Links belong on labels or results.
Keep repo-specific requirements and human checklists; never tick human attestations.
-->
## What

- **Change:** <what changes and for whom>

## Why

- **Reason:** <why this change is needed>

## Proof

- **Local gate:** <command and actual result on the proposed head>
- **Requirements:** <requirement ids and their tests or other evidence>

## Before merge

<!-- Remove this section when nothing is open; never tick a human attestation. -->
- [ ] **Remaining work:** <open check or owner action>

<!--
Decision4 writing rules:
- Use the exact heading below and one coloured circle only, beside the selected class: 🟢 Undo, 🟡 Repair, 🟠 Migrate or 🔴 Answer.
- The sentence after the class explains why this class applies with concrete recovery requirements; do not write "contained fix-up".
- List Recovery steps in order, numbered when there is more than one. For Undo the sentence may suffice and Recovery steps may be omitted.
- Do not repeat the sentence in the steps or invent steps to fit a class.
- Include Work preserved only when this PR really keeps something recoverable; claim backups only when the PR supports them.
- Responsible for recovery is a role; Answer requires a named person.
- Choose one class per PR, the highest that applies; split a PR whose parts need very different classes.
- Classification change is None unless the class changes; then record from -> to, by whom and why.
-->
### How hard is it to undo this PR after merging?

**🟡 Repair** — <why this class: what goes wrong beyond a plain revert, specific>

- **Recovery steps:**
  1. <first step>
  2. <next step>
- **Work preserved:** <optional; only when the PR really keeps something recoverable>
- **Responsible for recovery:** <role; at Answer a named person>
- **Classification change:** None

<details>
<summary>Recovery levels</summary>

Undo — Revert only
Repair — Revert plus fixes or a release
Migrate — Move data, state, or users back
Answer — Cannot fully recover; a named person is accountable

</details>

<!-- Keep Decision record only at Migrate/Answer; remove it at Undo/Repair. -->
## Decision record

- **Chose:** <selected option>
- **Over:** <alternative considered>
- **Because:** <reason for this choice>
- **Commits us to:** <follow-up or lasting obligation>
