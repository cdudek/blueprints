---
name: nextjs-ui
description: The central React component library, styleguide and theme within a Next.js product
read-when: building a screen, adding a primitive, changing tokens, providers or the app shell
skip-when: changing only server behavior with no visual surface
---

# UI

Apply [core design](../../core/references/design.md), [UX](../../core/references/ux.md) and [interaction](../../core/references/interaction.md). Each product owns one central UI library. A visual decision has one place to change.

## Rules

- **NEXT-UI-1 Separate the component, its examples and its tokens.** `src/ui/components/` contains generic primitives and patterns; `src/ui/styleguide/` contains their catalog; `src/ui/theme/` contains semantic tokens, themes and base styles. Business components live in their module. Import primitives by file path, without a root component barrel. The root layout imports the global stylesheet once.
- **NEXT-UI-2 Keep the UI a leaf.** Components depend only on other UI files and an explicit package allowlist in `architecture.yaml`. They import no modules, env, auth, clients, database or app routes. Text and localized labels arrive as props. The styleguide composes these components with sample data, never a live service.
- **NEXT-UI-3 Wrap the default libraries centrally.** shadcn on Radix, Tailwind, `class-variance-authority` and `tailwind-merge` follow [core stack](../../core/references/stack.md). Point the shadcn generator at `ui/components` and its shared styling helper so it does not create a second library. Map semantic CSS variables to Tailwind utilities in the theme; restrict source scanning to product UI, not prose archives. Icons have one door in `ui/icons/`.
- **NEXT-UI-4 Prefer native props and composition.** Extend the native element's TypeScript props, preserve ref behavior for the installed React release and merge `className` consistently. Use closed variant names and slots rather than boolean mode combinations. Interactive primitives own their client boundary. Server-rendered children can occupy a client wrapper's slots.
- **NEXT-UI-5 Compose providers once.** The app shell owns provider order and navigation. Keep providers as deep as their consumers allow, and put browser SDKs inside a small client provider. Theme initialization must agree with the server-rendered first paint. Any pre-paint script is a reviewed static string with the product's CSP treatment; user text never becomes script source.
- **NEXT-UI-6 The styleguide is a maintained surface.** Include every primitive's loading, empty, disabled, error, focus and theme states. Colocate `*.stories.tsx` with components and use the same theme in Storybook. A deployed styleguide follows the product's visibility decision and cannot expose internal sample data.

## How to apply

Build the theme, then the first components, their stories and the styleguide before the first screen. Put generic hooks beside the UI they support, and domain hooks beside their module component. Existing company UI packages are wrapped through this same central surface.

Changing later: inspect a component's callers and accessibility locators before changing its words or props. Review it in the styleguide and in one real consuming page, including keyboard use, reduced motion, zoom and every theme.

## Checks

- Automatic: leaf and icon import rules, raw token and raw primitive guards, Storybook rendering and axe checks. See [testing](testing.md).
- Review: component placement, composition API, theme first paint, focus order and the states shown by the styleguide.

## Mistakes to avoid

- A second `components/ui/` generated beside the central library.
- A client barrel that turns static primitives into browser code.
- A catalog of examples whose colors or providers differ from the app.
