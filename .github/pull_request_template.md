## What and why

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
