---
name: design
description: What DESIGN.md must contain and how the central ui/ folder (components, styleguide, theme and tokens) keeps every feature visually consistent.
read-when: Setting up the UI layer, adding or changing any screen, component, colour, size, icon or animation.
skip-when: Backend-only changes with no UI effect.
---

# Design

Design lives in one place. DESIGN.md says what the product looks and moves like and why. A central `ui/` folder holds the components, the styleguide and the theme. Features compose components from `ui/`; they never style anything on their own. If it appears twice, it is a component.

## Rules

### DESIGN.md

- **DSG-1. DESIGN.md exists in every product root and is the only visual authority.** It states the rules and the reasons; token values live in code (the theme) and DESIGN.md points to them.
- **DSG-2. It covers these topics:** colour (surfaces, text, accent, status, how depth works), typography (families, scale, numerals), shape and density (radius, spacing, control heights), motion, icons, where things open (dialog, panel, popover), feedback, and the voice rules that touch the screen (link to [copy](copy.md)).
- **DSG-3. It states the visual direction in words before values.** Mood, references to embrace, references to reject (the same anti-references as [product](product.md)). An agent needs the intent to resolve a case the rules do not cover.
- **DSG-4. Every rule has a reason.** "Controls are one shade lighter than their surface, so depth reads without shadows." Rules without reasons get broken by the next agent.

### The ui/ folder

- **DSG-5. One central `ui/` folder owns components, theme and styleguide.** Base components come from the chosen kit (shadcn on Radix, latest stable at build time) and are edited in place. Only domain-independent building blocks live here; a component that knows a business noun lives in its module (STR-19).
- **DSG-6. If something appears twice, make it a component.** A second use of a pattern is the trigger, not the third. The component takes its variants through props, not copies.
- **DSG-7. No raw colours, sizes or controls outside `ui/`.** Features do not write hex or rgb values, pixel sizes, arbitrary Tailwind values or native form controls (input, select, button). They use components and tokens. A check fails the build on a violation.
- **DSG-8. Tokens are the only source of colour, space, radius, type and motion values.** Defined once in the theme as CSS variables, mapped into Tailwind. Tokens are semantic (surface, text-muted, accent, danger), not literal (blue-500).
- **DSG-9. A styleguide page renders every component in every variant and state, in both themes.** It is part of the app (dev and staging) and is the visual test surface. A component that is not on the styleguide does not exist.
- **DSG-10. Dark mode ships on day one.** Both themes are defined with the tokens, not patched later. Contrast is checked in both (see [ux](ux.md)). The saved theme is applied by an inline head script so there is no flash.
- **DSG-11. Icons come from one set (lucide) through one `Icon` wrapper.** Fixed sizes from tokens, a text label or accessible name always present, never colour as the only signal.
- **DSG-12. Motion uses one library (`motion`) with duration and easing tokens.** Motion explains a change (something appeared, moved, was removed); it is never decoration. Reduced-motion settings turn it off or shorten it to a fade.
- **DSG-13. Toasts use `sonner` through one wrapper in `ui/`.** Features call the wrapper with a kind and a message key. Wording and timing rules are in [interaction](interaction.md).
- **DSG-14. Layout widths are fixed per page type.** Reading pages, forms, tables and dashboards each have one container width token. One mobile navigation pattern for the whole product.
- **DSG-15. States are components.** Loading skeleton (final size), empty, error, offline, disabled and permission-limited states each have one shared component. See [ux](ux.md).
- **DSG-16. Marketing site and product share tokens.** If they are separate apps, tokens are copied verbatim or imported from one package, never retyped.

## How to apply

1. Write the direction section of DESIGN.md with the owner: mood, references, anti-references. Pick one accent and one neutral family; derive both themes from them.
2. Create the theme file with semantic tokens for both themes. Map them into Tailwind. Remove the kit's default raw palette from usage.
3. Install the base components, then add the shared state components, `Icon`, toast wrapper and layout containers.
4. Build the styleguide page before the first feature screen.
5. Add the guard checks (below) before the first feature lands, so the first violation fails rather than the hundredth.
6. When a feature needs something new, add it to `ui/` and the styleguide first, then use it. Update DESIGN.md if the change is a rule, not just a component.

```
ui/
  theme/        tokens (both themes), Tailwind mapping, head script
  components/   base kit + product components, one folder each
  states/       Skeleton, Empty, Error, Offline, Disabled reason
  styleguide/   page that renders every component, variant, state, theme
```

## Checks

- Automated: a tree-wide scan fails on hex, rgb, hsl or oklch literals, arbitrary pixel values and native form controls outside `ui/`.
- Automated: a check that every exported component appears on the styleguide.
- Automated: contrast of every text and control token pair, in both themes, against the floors in [ux](ux.md).
- Automated: a visual snapshot per styleguide component in both themes (see [testing](testing.md)).
- Review: duplication. Two near-identical blocks in features means a missing component.
- Review: the changed control is seen in the running app, not only in code.

## Mistakes to avoid

- Dark mode added later, which turns every hard-coded colour into a bug.
- Feature code with its own padding, radius and colours, so no two screens match.
- Tokens named by value (blue-500), so a rebrand touches every file.
- A styleguide that drifts because it is not part of the build.
- Skeletons that do not match the final layout, so content jumps on load.
- Animation as decoration, ignoring reduced-motion settings.
- Using the kit's defaults unchanged, which gives the generic look PRODUCT.md rejects.
