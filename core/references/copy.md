---
name: copy
description: Rules for all product and marketing copy: plain language, hopes before benefits before features, one word per meaning, error and empty-state patterns, landing page order and changelog entries.
read-when: Writing or reviewing any text a user reads: UI labels, errors, empty states, emails, landing pages, changelog, metadata.
skip-when: Code comments and internal docs, unless they feed user-facing text.
---

# Copy

Copy is part of the product. It is short, plain and specific, uses the user's own words, and leads with what the person hopes for. The vocabulary comes from [product](product.md) and the glossary in `docs/ux/` (see [ux](ux.md)). All strings are message keys (see [i18n](i18n.md)).

## Rules

### Voice

- **CPY-1. No filler.** Cut every word that carries no meaning: "just", "simply", "very", "actually", "in order to", "we are happy to". If a sentence still works without a word, delete it.
- **CPY-2. Simple language.** Short words, short sentences, active voice, one idea per sentence. Write for a reader who is busy and not a native speaker.
- **CPY-3. Sentence case everywhere.** Headlines, buttons, labels, menu items. Capitals only for names.
- **CPY-4. Use the user's nouns.** Not the database's or the framework's. If users say "project", the UI never says "workspace entity".
- **CPY-5. One word per meaning.** The glossary lists the word chosen and the words rejected. A test fails the build on a rejected word in UI strings.
- **CPY-6. Verbs on actions.** Buttons say what happens: "Save draft", "Delete project", "Send invite". Not "OK", "Submit", "Yes".
- **CPY-7. Banned:** exclamation marks, "please", "oops", "Success!", "Introducing", "we're excited", hype words ("seamless", "unlock", "powered by", "delightful", "revolutionary"), and em dashes. Use commas, periods and parentheses.
- **CPY-8. No "AI" in headlines.** Say what the product does for the person. AI may appear in body text where the user needs to know it.
- **CPY-9. Honest claims only.** State limits. Do not promise what the product does not do.
- **CPY-10. The brand name has one spelling in prose,** set in PRODUCT.md. Logo lockups and identifiers may differ and are listed there.

### Order of persuasion

- **CPY-11. Hopes and dreams first, benefits second, features last.** Say what the person wants to be true ("Know what you saved, months later"), then what they get ("Find anything in seconds"), then how ("Search across notes, links and files"). The hopes come from PRODUCT.md.
- **CPY-12. Never write feature-level copy on its own.** A feature name or capability without the benefit and the hope above it does not ship.
- **CPY-13. Proof beats adjectives.** Real numbers, real screenshots, real quotes. No stock photos of people, no invented testimonials.

### Messages

- **CPY-14. Errors say what happened, what it means, what to do.** "We could not save your changes. Your connection dropped. Try again." Never "Something went wrong". No blame, no codes. Keep the cause beside the object (see [interaction](interaction.md)).
- **CPY-15. Empty states give the fact, then a way out.** "No invoices yet. Create your first invoice." For no-results: say what was searched and how to widen it.
- **CPY-16. Confirmations state the result, in the past tense.** "Project archived." Never "Success!".
- **CPY-17. Disabled reasons name the missing condition.** "Add a payment method to publish."
- **CPY-18. Never show internal identifiers** (permission codes, IDs, tool names), except the support reference id of OBS-8 and the published MCP tool names on the MCP landing page (MCP-7). Say what the person can or cannot do and offer the next step.

### Landing page and changelog

- **CPY-19. Landing page order:** hero (hope, one line, one call to action), proof (numbers, screenshot), how it works (3 steps), benefits, features, objections (pricing, privacy, limits), final call to action. One page, one action.
- **CPY-20. Changelog entry: one change, second person, 1 to 3 sentences, one call to action** (verb plus object, linking to the feature). Written in the feature's own PR, sentence-case title, dated. No roundups, no teasers, no apologies.

## How to apply

1. Take vocabulary, banned words and brand spelling from PRODUCT.md; create the glossary with rejected words.
2. For each screen, write copy after the state table exists, so errors, empties and disabled reasons all get words.
3. Draft marketing copy in the order hope, benefit, feature; delete the feature line if it stands alone.
4. Put every string in message files from day one. Review copy against the real action and the user's state, not in isolation.
5. Each feature PR adds its changelog entry.

## Checks

- Automated: glossary test for rejected words; a banned-pattern scan for "!", "please", "oops", "Success", em dashes and the hype list in message files and templates.
- Automated: no string literal in components outside message files (see [i18n](i18n.md)).
- Automated: changelog entries match the schema (title, date, 1 to 3 sentences, exactly one call to action).
- Review: every error, empty and disabled string follows its pattern.
- Review: landing and feature copy read hope before feature.

## Mistakes to avoid

- Feature lists as headlines ("Semantic search, tags and AI summaries").
- "Something went wrong" and "Invalid input" with no next step.
- Two words for one thing across menus, buttons and emails.
- Copy written last, after the layout, so it is squeezed to fit.
- Announcing AI instead of the benefit.
- Changelog entries addressed to no one ("Users can now...").
- Inconsistent brand spelling in titles, metadata and emails.
