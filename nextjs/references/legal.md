---
name: nextjs-legal
description: Public legal routes and consent integration in a localized Next.js app
read-when: creating legal pages, changing data processing, adding a vendor or shipping a public surface
skip-when: changing internal behavior that affects no legal statement or consent category
---

# Legal

Apply [core legal](../../core/references/legal.md). The owner supplies and reviews the legal content. Next.js only determines how the published documents are routed, rendered and connected to consent.

## Rules

- **NEXT-LEGAL-1 Legal routes work without a session.** Privacy, imprint and the terms or other documents required by core live in the public locale route tree. The footer and sign-in screens link to canonical localized URLs using the central UI. The request interceptor and protected layouts must not redirect a signed-out reader away.
- **NEXT-LEGAL-2 Render approved content on the server.** Give each document an owner, effective date and locale policy. Preserve headings, accessible navigation and stable links. Published text has no placeholders, invented company facts or sample addresses. Do not bundle legal content with a server configuration or credential export.
- **NEXT-LEGAL-3 Consent and documents describe the same deployment.** The vendor list, analytics region, cookies and retention statements match the providers selected by the factories. Optional browser SDKs obey [tracking](tracking.md). Adding a provider triggers the core legal review before collection starts.

## How to apply

Create public routes and navigation during the public-surface step, then request the owner's content and review through core's process. Preview the rendered documents signed out, in every supported locale and at mobile widths before launch.

Changing later: keep the prior effective version as core requires and update consent behavior alongside changed processing. Legal content and production data remain the Decision4 ground defined by core; do not class them as ordinary styling.

## Checks

- Automatic: signed-out Playwright journeys reach all required documents from footer and sign-in, verify their locale and detect placeholder content; consent tests cover the configured categories.
- Review: legal sufficiency, factual company details, translations, effective dates and vendor accuracy. No framework check can approve these.

## Mistakes to avoid

- Legal pages nested under a signed-in app layout.
- Consent copy that describes a provider the factory no longer uses.
- Publishing a plausible generated imprint before the owner supplies the facts.
