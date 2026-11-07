---
name: product
description: What PRODUCT.md must contain in every product, and how agents use it as the source of truth for who the product is for and what it will not do.
read-when: Setting up a new product, writing or changing any user-facing behaviour, copy or design, or when a request seems to conflict with the product's purpose.
skip-when: Pure infrastructure or refactoring work that changes nothing a user sees.
---

# Product

Every product root carries a PRODUCT.md. It is the shortest document that tells an agent who the product is for, what those people hope for, and what the product refuses to be. Agents read it before they design, write copy or add features. When two documents disagree, PRODUCT.md wins over [design](design.md), [ux](ux.md) and [copy](copy.md).

## Rules

### Content

- **PRD-1. PRODUCT.md names the audience concretely.** Who they are, what they do all day, what they already use, what they are allergic to. One primary audience; others are listed as secondary and do not drive decisions. "Everyone" is not an audience.
- **PRD-2. It states the jobs, hopes and dreams of that audience.** What they are trying to get done, and what they hope will be true afterwards. This is the raw material for [copy](copy.md): hopes first, benefits second, features last.
- **PRD-3. It states the purpose in one paragraph.** What the product does, in the user's words, and what success looks like after three months in measurable terms (for example "returns weekly", not "engagement").
- **PRD-4. It lists what the product deliberately does not do.** Each item says why. Non-goals stop agents from adding plausible features. A feature that is on this list needs an owner decision to build.
- **PRD-5. It carries the vocabulary.** The nouns and verbs the user uses, the one word per meaning, and the words that are banned. The glossary in `docs/ux/` expands this; PRODUCT.md holds the core terms and the brand name spelling.
- **PRD-6. It states 4 to 7 product principles.** Each is a trade-off, written as "X even over Y", with one example. A principle that nobody could disagree with is not a principle.
- **PRD-7. It lists things to avoid.** Looks, tones and patterns the product rejects (generic AI look, clone aesthetics, hype copy), named so a reviewer can point at them.
- **PRD-8. It states the register.** Product (the tool is the point) or brand (the story is the point). The register steers [design](design.md) density and [copy](copy.md) tone.
- **PRD-9. It states the accessibility and inclusion floor.** At least WCAG 2.2 AA (see [ux](ux.md)), plus anything specific to the audience (languages, devices, assistive tech).
- **PRD-10. It states the business model in two lines.** Free or paid, who pays, what is limited. Agents need this to build limits, paywalls and legal pages correctly.

### Use

- **PRD-11. Agents read PRODUCT.md first, and cite it.** A PR that adds user-facing behaviour says which audience job or principle it serves. A PR that touches a non-goal links the owner decision.
- **PRD-12. PRODUCT.md changes only by owner decision.** Agents propose edits; they do not rewrite the audience or principles on their own. Superseded text is kept in the decision record (see [decisions](decisions.md)), not deleted silently.
- **PRD-13. It stays short.** Target 100 to 200 lines. Long strategy material lives elsewhere and is linked.

## How to apply

1. Interview the owner before writing anything: audience, jobs, hopes, non-goals, words they use, products they admire and reject. Do not invent the audience from the product idea.
2. Write PRODUCT.md from the sections below, in this order.
3. Read it back to the owner and get a yes. Record the date.
4. Reference it from the root agent file (see [agent-files](agent-files.md)) as the first document to read.
5. When a later task contradicts it, stop and ask. Do not resolve it silently.

```
PRODUCT.md
  Brand name and spelling
  Register (product | brand)
  Users            who, day in the life, what they already use, what they dislike
  Jobs and hopes   what they want done, what they hope is true afterwards
  Purpose          one paragraph, plus success after three months
  Business model   two lines
  Does not do      list, each with a reason
  Vocabulary       core nouns and verbs, banned words
  Principles       "X even over Y", one example each
  Brand voice      three adjectives, what it sounds like, what it never sounds like
  Avoid            anti-references
  Accessibility    floor and audience-specific needs
```

## Checks

- Automated: a check that PRODUCT.md exists, has every section heading above and is referenced from the root agent file.
- Automated: banned words from PRODUCT.md vocabulary are searched in UI copy and docs (see [copy](copy.md)).
- Review: every PR with user-facing change names the job or principle it serves.
- Review: the owner re-reads PRODUCT.md at each milestone start and at any pivot.

## Mistakes to avoid

- Writing the audience as a demographic ("25 to 40, urban") instead of what they do and need.
- Listing features instead of jobs. Features change; jobs do not.
- No non-goals, so each agent session adds a "small helpful" feature.
- Principles that are slogans ("be simple") with no trade-off and no example.
- Letting the document grow into a strategy deck that nobody reads before acting.
- Keeping vocabulary only in the head of the owner, so the UI ends up with three words for one thing.
