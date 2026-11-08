<!--
Scannable layout: What, Why, Proof, Before merge (only if open), then Decision4
when boundary-map.yaml exists, then Decision record at Repair/Migrate/Answer.
Every section heading is H2. Sections use lists with bold labels; one idea per bullet, at most two lines.
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
- Source: Habitat Thinking Decision4 v1.0.1, pinned at 4429f821780655f253a954b2659bf38e7b9d5517.
- Read boundary-map.yaml; use the highest decision class, at or above its floor. Unmapped or unsure: higher class and log a map gap.
- Select exactly one bold class with its one colour circle: 🟢 Undo, 🟡 Repair, 🟠 Migrate, 🔴 Answer.
- Explain who has to put it right and what it takes. Do not invent recovery steps, backups or preserved work.
- Repair and above need Recovery steps as a standalone bold line and a top-level numbered list. Undo may omit them.
- Responsible for recovery is a role; at Answer it must be a named person or @handle.
- Classification change is None unless changed; record from -> to, who raised/lowered it and why. Never lower silently.
- Keep Decision record at Repair (Chose / Over / Because / Commits us to), Migrate (Options: at least two real options, or one Forced with its Constraint), Answer (labelled Evidence and Challenges; no recommendation). Omit it at Undo.
- Keep only the applicable class block under Decision record; delete the other blocks.
- Migrate requires Class with put-right, Who answers, Commits us to, and Chosen by: <person>; every option states its commitments.
- Answer requires every section 9 field, labelled Evidence and Challenges, with no recommendation or ranking.
- A person writes Answer Decision and Commits us to; agents leave <person writes> and validation fails until filled. General knowledge is not evidence.
- Unattended runs close only Undo; above Undo hand back and stop unless the owner has explicitly authorized the work.
- Preserve repo-specific human checklists and use H2 headings throughout.
-->
## How hard is it to undo this PR after merging?

**🟡 Repair** — <who has to put it right and what it takes, concrete>

**Recovery steps**

1. <first step>
2. <next step>

- **Responsible for recovery:** <role; at Answer a named person>
- **Classification change:** None

## Decision record

<!-- Keep only the block for the selected class; delete this section at Undo. -->

**Repair**

- **Chose:** <what was decided>
- **Over:** <viable alternative>
- **Because:** <reason>
- **Commits us to:** <what this ties the team to>

**Migrate**

<!-- An agent drafts viable options; the accountable owner chooses on the record. -->
- **Class:** Migrate; put-right: <coordinated change needed if wrong>
- **Who answers:** <accountable person or role>
- **Commits us to:** <what the chosen option ties the team to and how it could fail later>
- **Chosen by:** <person>

**Options**

1. **Option 1:** <viable option>; **Commits to:** <its commitments>
2. **Option 2:** <viable option>; **Commits to:** <its commitments>

<!-- Or one numbered Forced option with its Constraint and Commits to. -->

**Answer**

<!-- Evidence and challenge only: no recommendation or ranking. General knowledge is not evidence about this case.
A person with standing writes Decision and Commits us to; agents leave <person writes> and validation fails until filled.
Every evidence claim is labelled observed / inferred / asked / unknown. Revisit when is a condition, not only a date. -->
- **Title:** <decision title>
- **Status:** <proposed / accepted / superseded / retired>
- **Context:** <case-specific context>
- **Decision:** <person writes>
- **Class:** Answer; put-right: <who outside the team is affected and why nothing unmakes it>
- **Who answers:** <named person or @handle with standing>
- **Rejected alternative:** <a viable alternative>
- **Provenance:** <evidence and challenges supplied by the agent; choice made by the person>
- **Class history:** <escalations, recorded de-escalations and designs that lowered the class; or unchanged>
- **Commits us to:** <person writes>
- **Last validated:** <when and by whom this was checked>
- **Revisit when:** <condition that calls for revalidation>

**Evidence**

- **observed:** <checked directly by reading, running or measuring>
- **inferred:** <reasoned from observations>
- **asked:** <what a person who was asked said>
- **unknown:** <material gap not established by anyone>

**Challenges**

- **Challenge:** <what would make the decision wrong>

<details>
<summary>Recovery levels</summary>

Undo — a revert puts it right
Repair — real work, contained to this team
Migrate — coordinated change involving other people
Answer — someone outside the team with standing to ask is affected, and nothing unmakes it

</details>
