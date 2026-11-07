---
name: ux
description: The docs/ux/ document set, the Laws of UX design gate, how each page is structured (information architecture), required states, the accessibility floor, and responsive and zoom behaviour.
read-when: Designing or changing any screen, flow, navigation or page structure, or reviewing a UI change.
skip-when: Backend-only changes with no screen or flow effect.
---

# UX

UX decisions are written down once and checked before build, not argued per screen. The set lives in `docs/ux/`. Information architecture (IA) here means how each page is structured: header, sections and actions per page type, plus how pages connect. Interaction behaviour is in [interaction](interaction.md), words in [copy](copy.md), looks in [design](design.md).

## Rules

### The docs/ux/ set

- **UX-1. Every product has these files in `docs/ux/`:** `interaction.md` (named interaction rules, not principles), `information-architecture.md` (page types, navigation), `glossary.md` (one word per meaning), `sitemap.md` (every page, route, way in, Back target), `decisions.md` (accepted UX decisions with reasons).
- **UX-2. `interaction.md` holds named, numbered behaviours.** "Closing a dirty form asks Save, Don't save, Cancel" is a rule. "Be consistent" is not. Each rule has an ID, a reason, an example and the check that enforces it, or says that nothing does.
- **UX-3. The sitemap is the one list of pages.** Per page: route, page type, purpose, roles, tabs, filters held in the URL, states, every way in, Back target, access rule. A page not in the sitemap does not ship.
- **UX-4. The glossary is the vocabulary.** One word per concept, with the words rejected. Seeded from [product](product.md), grown by every feature, checked by a test.

### Laws of UX as a design gate

- **UX-5. Every new screen or flow passes a Laws of UX check before build.** Each law gets pass, fail or not applicable, with evidence in one line. Fails block build until fixed or accepted by the owner with a reason.
- **UX-6. The laws most often decisive:** Hick (fewer choices at once), Fitts (target size and distance), Jakob (behave like products people already know), Miller (chunk), Doherty (respond within 400 ms), Postel (accept input generously), Tesler (move complexity to the system), Zeigarnik and Peak-End (finish states and last impressions matter), Aesthetic-usability (polish buys patience).
- **UX-7. Laws support rules, they do not replace them.** A law is cited as the reason for a rule in `interaction.md`; reviewers cite the rule.

### Information architecture: how each page is structured

- **UX-8. Every page has a page type, and the type fixes the structure.** Typical types: list (title, count, search and filters, primary action top right, rows), detail (title, status, tabs or sections, actions in the header), form (title, grouped fields, one primary action at the end), dashboard (summary first, then detail), settings (grouped sections, each saves clearly), reading page (content width, no chrome).
- **UX-9. Every page has a header.** Title in the user's noun, one-line context if needed, status where state matters, and the page's primary action in a fixed place. The same type puts the same things in the same place.
- **UX-10. Sections are ordered by user priority, not by data model.** What the user came to do first; rarely used things last or behind a disclosure.
- **UX-11. Actions are placed by scope.** Page-level actions in the header, section actions in the section header, row actions on the row (and in a row menu). One primary action per view. A tab has at most one header action.
- **UX-12. Navigation is shallow and named by the user's nouns.** One primary navigation, one mobile pattern. Depth beyond 3 levels needs a reason. The current place is always visible.
- **UX-13. Back always returns to the place the user came from,** with list, search, scroll and focus preserved. Deep links work: every state worth sharing has a URL (see [interaction](interaction.md)).
- **UX-14. Moving a page is additive.** Old URLs redirect. The sitemap records the redirect.

### States, accessibility, responsive

- **UX-15. Every screen defines its states:** loading, empty (first use and no results), error, offline, disabled, permission-limited, and the normal state. Each uses the shared state component from `ui/` (see [design](design.md)). A screen without its state table is not ready.
- **UX-16. WCAG 2.2 AA is the floor.** Accessible names on every control, text contrast 4.5:1 (3:1 for large text and control edges), targets at least 24 px, full keyboard operation, visible focus, 150 percent zoom without loss, reduced-motion respected, colour never the only signal, correct ARIA roles only where native elements fall short.
- **UX-17. Responsive from the start.** Layouts work at 360, 768 and 1280 px wide. No horizontal page scroll. Tables have a small-screen form (cards or priority columns). Touch targets are comfortable on touch devices.
- **UX-18. Zoom and text size are tested.** At 150 percent zoom and 200 percent text size, nothing is cut off or overlaps, and every action stays reachable.

## How to apply

1. Create `docs/ux/` with the five files. Seed the glossary from [product](product.md) vocabulary.
2. List the pages. Assign page types. Write the sitemap before building routes. The route registry in code is generated from, or checked against, it (see [seo](seo.md) for the sitemap file that search engines read).
3. For each new screen: write the state table, place header and actions by its page type, run the Laws of UX check, then build.
4. When a rule is missing, stop and ask the owner; record the answer in `decisions.md` and add the rule to `interaction.md`.
5. When changing a page, update the sitemap and the state table in the same PR.

## Checks

- Automated: routes in code match the sitemap (no unlisted page, no dead entry).
- Automated: glossary test fails on banned words in UI copy and message files (see [copy](copy.md), [i18n](i18n.md)).
- Automated: accessibility scan (axe or equivalent) on every page in both themes; contrast checks on tokens.
- Automated: end-to-end tests cover keyboard-only paths for the main flows and the states of each screen (see [testing](testing.md)).
- Automated: viewport tests at 360, 768 and 1280 px fail on horizontal overflow.
- Review: Laws of UX table and state table attached to each screen's PR.
- Review: the screen seen in the running app at 100 and 150 percent zoom.

## Mistakes to avoid

- Pages organised by database tables instead of by what the user came to do.
- The same page type laid out differently on each page, so users relearn it.
- Two names for one place in navigation, titles and breadcrumbs.
- States designed last, so error and empty screens are blank or generic.
- Moving or renaming URLs without redirects.
- Treating accessibility as a late audit; keyboard and contrast failures are cheapest at design time.
- Checking only the default width and theme.
