---
name: nextjs-auth
description: Better Auth integration and request-scoped authorization across Next.js pages, actions and route handlers
read-when: adding sign-in, linking identities, reading a session, protecting an operation or changing auth configuration
skip-when: changing a public page without session or access behavior
---

# Auth

Apply [core auth](../../core/references/auth.md) and [security](../../core/references/security.md). Better Auth is the default. Next.js adapters are thin; the module that owns identity owns its persistence and session loading.

## Rules

- **NEXT-AUTH-1 Give auth one server owner.** An accounts or identity module configures Better Auth, its database adapter, magic link, email and password, and Google sign-in. Its server door exposes session loading and identity operations; `shared/` holds only the pure session contract and access helpers. The auth route delegates protocol handling to the library without recreating it in Server Actions.
- **NEXT-AUTH-2 Pass request identity to operations.** A page, action or route reads the session through the owner and passes it explicitly to the operation. Each operation declares core's access policy and checks the resource permission, including reads. Never hold a session in a process singleton or cache it across requests. Recheck ownership after resolving a caller-supplied ID.
- **NEXT-AUTH-3 A Server Action is an endpoint.** Parse its untrusted input and enforce access inside the operation on every invocation. A hidden button, a layout redirect, an interceptor or an unguessable action ID grants no permission. Preserve framework origin checks and configure trusted proxy origins narrowly. See [Next.js data security](https://nextjs.org/docs/app/guides/data-security).
- **NEXT-AUTH-4 Identity linking is verified, not inferred.** Follow core's verified-email and account-linking rules using the auth library's supported flows. Persist uniqueness in database constraints, not a select-then-insert check. Validate post-auth destinations as allowed local routes and configure canonical auth callback origins per environment; a production callback must never fall back to localhost.
- **NEXT-AUTH-5 Test sessions cannot become production access.** Prefer the real auth flow through a fake mail provider. If a test-only session adapter is unavoidable, it refuses production independently of test flags and can create only isolated synthetic users. Previews have their own cookies, OAuth origins, database and credentials. No production admin identity or production session cookie enters a test run.

## How to apply

Create the identity module and migration, configure the supported sign-in methods, then wire the auth route and sign-in UI. Use one localized flow through the central UI and email client. Add negative access cases before connecting the first protected screen.

Changing later: treat callback URLs, cookie configuration, session formats and auth tables as compatibility boundaries. Test both an existing session and a fresh sign-in against the new revision. An auth-library upgrade is a separate change with its migration guide open.

## Checks

- Automatic: operation access registry, server import guards, missing session, wrong owner, wrong role, forged action input, unsafe redirect, duplicate verified identity and linking cases.
- Automatic: Playwright signs in through the mail harness, signs out, rejects an expired link and proves test adapters refuse production even with test flags set.
- Review: trusted origins behind the real proxy, cookie scope, identity-linking policy and session revocation behavior.

## Mistakes to avoid

- Treating a layout check as protection for every nested route and action.
- Auth persistence inside `shared/` or imported by a browser session hook.
- A preview that shares production cookies or credentials.
