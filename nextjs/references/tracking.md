---
name: nextjs-tracking
description: Typed analytics and flag adapters in App Router, with consent, navigation and hydration behavior
read-when: adding an event, feature flag, consent UI or analytics provider
skip-when: changing a feature without tracking, flags or browser SDK behavior
---

# Tracking

Apply [core tracking](../../core/references/tracking.md). PostHog is the analytics and flag backend; OpenFeature is the flag API. The Next.js integration adds a browser boundary and navigation lifecycle, not a second event registry.

## Rules

- **NEXT-TRACK-1 Split browser and server adapters.** Both implement the typed event registry from core, but only the browser entry can load a browser SDK. The server provider is `server-only`. Compose the consent-aware browser provider once in the app shell, scoped to its consumers. Public project configuration is distinct from server administrative credentials.
- **NEXT-TRACK-2 Own page views in one place.** App Router navigation needs one page-view observer or the provider's supported automatic mechanism, never both. Define the route-ready event, prevent hydration duplicates, and remove sensitive query parameters and resource identifiers before sending a URL. Server mutation success events fire after commit, not on a button click that can fail.
- **NEXT-TRACK-3 Consent controls SDK behavior.** Follow core's consent categories before loading or sending. Withdrawal stops collection and clears identifiers according to policy; sign-out resets identity. Keep the first rendered consent state consistent with hydration. A production build used for e2e has fake analytics and flags, with outbound network blocked.
- **NEXT-TRACK-4 Flags use one evaluation contract.** Server operations and UI use OpenFeature with a documented default and evaluation context. Pass a browser-safe evaluated result when necessary so hydration does not flip a decision. A flag never replaces authorization; a client cannot unlock a protected operation by changing it.

## How to apply

Add the event definition and consent category first, then wire the server or browser adapter at the owning boundary. Test the route transition and committed operation that should produce it, plus the failed operation that should not.

Changing later: preserve event names and property meanings under core's compatibility rules. Inspect payloads captured by a fake provider; do not validate by sending synthetic user data into production analytics.

## Checks

- Automatic: typed event names, provider import boundaries, no send before consent, withdrawal, identity reset, one page view per navigation and no mutation-success event on failure.
- Automatic: flags cannot bypass resource access; server and first client flag values agree.
- Review: payload privacy, consent copy, event usefulness and provider region configuration.

## Mistakes to avoid

- Initializing the SDK in both a layout and a page.
- Capturing the full URL with tokens or user-entered query text.
- Loading analytics before consent and only hiding the banner afterward.
