---
name: tracking
description: Product analytics with PostHog: one typed event registry, consent model, privacy limits, kill switch.
read-when: adding or changing an event, the consent banner, analytics config, CSP, or anything that sends data to an analytics vendor.
skip-when: the change neither sends analytics nor touches consent.
---

# Tracking

Analytics answers product questions with the least data possible. PostHog is the tool. It starts cookieless and anonymous; only an explicit "Allow all" turns on persistence and identification. It never blocks a user, and one env variable turns it off.

## Rules

### Events

- **TRK-1: One typed event registry** is the only place events exist. Each entry: name, allowed properties with types, and the question it answers. Code calls `track(event, props)`; the function is typed against the registry. Free-form event names fail typecheck.
- **TRK-2: Names are `object_pastverb` in snake_case** (`invoice_sent`, `signup_completed`). One event per fact; no UI-label names.
- **TRK-3: Properties are allow-listed primitives** (string from a fixed set, number, boolean). No objects, no free text, no email, name, IP, token or id of a person. The sender drops any property not in the registry.
- **TRK-4: No PII, ever,** in events, properties, super properties or person properties. Identify uses an opaque internal user id only, and only after consent (TRK-8).
- **TRK-5: Tracking never blocks or breaks a user action.** Calls are fire-and-forget, wrapped, time-bounded; failures are swallowed and logged. A product works fully with analytics blocked.
- **TRK-6: Server-side events** (from actions, webhooks, jobs) go through the same registry and a client interface with real, fake and noop providers (see [clients](clients.md)). Tests use the fake.

### Consent

- **TRK-7: Cookieless by default.** Before consent, PostHog runs without cookies or local storage persistence, no identify, no session replay, no autocapture of free text. Pick the memory-only persistence mode.
- **TRK-8: Two choices only: "Allow all" and "Necessary only."** Same prominence, no dark patterns, no pre-ticked boxes. Only "Allow all" enables persistence, cross-session identity and `identify`.
- **TRK-9: Withdrawing is as easy as giving.** A visible link in the footer reopens the choice. Withdrawal clears vendor cookies and storage and resets the identity at once.
- **TRK-10: Sign-out resets identity** (reset the vendor distinct id). The next session starts anonymous.
- **TRK-11: The consent record is versioned** (choice, version, time). A change in purposes bumps the version and asks again.
- **TRK-12: Consent state is applied without flash.** A small inline script in the head reads the stored choice and sets the initial state before first paint; the banner renders on the server in the correct state. Only compile-time constants in that script.
- **TRK-13: Feature flags are separate from analytics consent.** Flag evaluation uses a timeout and a defined fallback (see [decisions](decisions.md) and [stack](stack.md)).

### Privacy limits

- **TRK-14: URLs are scrubbed before sending.** Strip query strings and fragments by default, keep an allow-list of safe params, mask path segments that hold tokens, ids or emails (reset, invite, share, magic-link URLs).
- **TRK-15: The admin area is never tracked.** No init, no events, no replay on admin routes.
- **TRK-16: Use the EU PostHog host,** latest stable SDK at build time, proxied through the product's own domain only if it keeps the same consent and CSP rules.
- **TRK-17: CSP lists the analytics host only when analytics is on** (see [security](security.md)). Removing the token or setting the kill switch removes both the script and the CSP entry.
- **TRK-18: Kill switch via env.** Empty token or an explicit disable variable turns off init, events and CSP entries. Local development and tests default to off.
- **TRK-19: Logs are separate from analytics.** Operational logs (see [observability](observability.md)) never feed analytics and carry no consent logic; analytics never serves as an audit log.
- **TRK-20: The privacy policy names PostHog, its region, the purposes and retention** (see [legal](legal.md)). Policy and registry change together.

## How to apply

1. Write the registry with the first three questions the owner wants answered. Add only events that map to a question.
2. Build the tracking client (interface, real, fake, noop), the consent store, the head script and the banner.
3. Add URL scrubbing, admin exclusion and the env kill switch before the first real event.
4. Update the privacy policy and cookie text in the same change.
5. When adding an event: add the registry entry, call it, add a test with the fake. Removing an event removes the entry and the dashboards that use it.

## Checks

- Typecheck: calls are typed against the registry.
- Unit tests: properties outside the allow-list are dropped; URL scrubber cases (tokens, emails, queries); consent transitions (default, allow, withdraw, sign-out reset).
- E2E: with no consent, no analytics cookie or storage key is set and no identify call is sent; after "Allow all" they are; after withdrawal they are gone; admin pages send nothing.
- E2E: with the kill switch on, no analytics script loads and the CSP has no analytics host.
- Test that blocking the analytics host does not break the page or an action.
- Left to review: whether a new event answers a real question; wording of the banner.

## Mistakes to avoid

- Autocapture sent form text and URLs with reset tokens.
- Identify ran before consent, so "cookieless" was untrue.
- A banner flashed on every load because consent was read after hydration.
- Withdrawal hid the banner but left vendor cookies in place.
- Sign-out kept the old distinct id, so two people on one device merged.
- Events with free-form names produced a dashboard nobody could maintain.
- The analytics host stayed in the CSP after analytics was disabled.
- A failing analytics call threw inside a save action and lost user input.
