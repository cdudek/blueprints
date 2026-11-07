---
name: interaction
description: Default interaction behaviour for every product: feedback, waiting, undo versus confirm, input safety, errors, retries, URL state, toasts, command palette and keyboard.
read-when: Building or changing any behaviour a user triggers: forms, saves, deletes, loading, errors, lists, filters, shortcuts.
skip-when: Static marketing content with no interactive behaviour.
---

# Interaction

How the product behaves when someone acts. The one idea: the system speaks in proportion to what the user cannot see. These defaults seed `docs/ux/interaction.md` (see [ux](ux.md)) in every product; a product may refine them but records each deviation as a decision.

## Rules

### Feedback and waiting

- **INT-1. Feedback is proportional to what the user cannot see.** If the change is visible and reversible, say nothing. Speak when work is hidden, slow, failed or happens elsewhere (email sent, data written to another system).
- **INT-2. Wait thresholds.** Under 400 ms: no indicator. 400 ms to 1 s: subtle busy state on the control. 1 to 10 s: inline progress at the place of the action. Over 10 s: run in the background, show progress in a persistent place, notify on completion.
- **INT-3. Nothing moves while loading.** Skeletons at final size, tabular numerals for changing numbers, reserved space for async content.
- **INT-4. After a server action: await, show the result, refresh the view.** Never tell users to reload the page.

### Safety

- **INT-5. Act first, undo after.** Reversible actions (archive, remove, move) happen at once and offer Undo for a short time. The Undo is also reachable by keyboard.
- **INT-6. Confirm only what cannot be undone.** Permanent deletion, sending to an outside party, overwriting someone else's data. The confirmation names the object and the consequence, and the button repeats the verb ("Delete project"), not "OK".
- **INT-7. Never lose input.** A failed submit keeps every field and the error shows beside the cause. Leaving a dirty form asks Save, Don't save, Cancel. Drafts survive reload where the cost of loss is high.
- **INT-8. A disabled control says why.** Tooltip or inline text names the missing condition and, if possible, the way to meet it.
- **INT-9. One save model per screen.** Either every control saves immediately, or the screen has an explicit Save with a visible unsaved mark. The Save control never moves or appears late.

### Errors and retries

- **INT-10. Errors appear next to the object that failed.** Field error under the field, row error on the row, page error in the page. A toast alone is never the only place an error lives.
- **INT-11. Errors say what happened, what it means, what to do.** Wording in [copy](copy.md). Never show internal codes or identifiers to people; log them with a request ID the user can quote.
- **INT-12. The UI retries reads, never writes.** Reads retry with backoff. The UI never resubmits a write on its own; it offers a manual retry, and writes are idempotent where the user can double-submit. Backend retries of writes follow CLI-12.
- **INT-13. Error boundaries at group level.** One failing widget shows its error state; the rest of the page keeps working.

### Navigation and state

- **INT-14. Filters, sort, tab and page live in the URL.** Back, reload and sharing restore the exact view. Search text and scroll position return after Back.
- **INT-15. Toasts go through `sonner`, via the wrapper in `ui/`.** Use them for confirmations of hidden results and Undo, not for errors that need action. Success toasts are short and say the result ("Project archived"). Errors that need action stay on screen until fixed. Toasts are announced to screen readers and do not steal focus.
- **INT-16. Dialogs and panels have one rule.** Detail beside its object uses a panel; short decisions use a dialog; neither stacks on another. Escape closes the top surface only; focus returns to the trigger.

### Keyboard and focus

- **INT-17. Every pointer action has a keyboard route.** No hover-only, drag-only or right-click-only actions. Focus order follows reading order; focus is always visible; focus moves into a new surface and back on close.
- **INT-18. Work-heavy apps get a command palette (cmd+K, ctrl+K) and shortcuts for frequent actions.** Marketing pages and simple tools do not. Shortcuts are listed on a `?` sheet and shown in tooltips. Single-key shortcuts are off while typing in a field.
- **INT-19. Never override browser or screen-reader keys.** No hijacking of tab, cmd+L, cmd+R, cmd+F, arrow keys in text, or keys used by common assistive tech. Every shortcut has a mouse alternative.
- **INT-20. Cmd/Ctrl+S saves in editors.** Enter submits single-field forms; Escape cancels or closes.

## How to apply

1. Copy these rules into `docs/ux/interaction.md` with product-specific examples, keeping the IDs so reviews can cite them.
2. Build the shared pieces once in `ui/`: busy button, skeleton, progress, inline error, toast wrapper, undo toast, confirm dialog, empty and error states (see [design](design.md)).
3. Decide per screen: save model, which actions are reversible, which need confirmation. Write it in the screen's state table.
4. For work-heavy apps, add the palette, the `?` sheet and a single registry of commands so palette, tooltips and the sheet read the same list.
5. When behaviour is not covered, ask the owner, then add a rule rather than a one-off.

## Checks

- Automated: end-to-end tests for undo, failed submit (input kept), dirty-leave prompt, URL restore after reload and Back, and keyboard-only completion of the main flows (see [testing](testing.md)).
- Automated: lint against native `confirm`, `alert` and direct toast library imports outside the wrapper.
- Automated: tests that every shortcut in the registry appears on the `?` sheet and none collides with reserved keys.
- Review: each new action classified reversible or irreversible, with the matching undo or confirmation.
- Review: wait states checked with throttled network.

## Mistakes to avoid

- Confirm dialogs for everything, so people click through the one that matters.
- Success toasts for visible changes, which teach people to ignore toasts.
- Errors shown only in a toast that vanishes before it is read.
- Auto-retrying a write and creating duplicates.
- Hiding a disabled button's reason, or removing the button entirely.
- Filters held in component state, so Back and sharing lose the view.
- Shortcuts that fire while typing, or that clash with browser or screen-reader keys.
