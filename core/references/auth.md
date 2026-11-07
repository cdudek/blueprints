---
name: auth
description: How users sign in, how routes are protected, and how access is decided in layers.
read-when: adding or changing sign-in, sessions, roles, route protection, access checks, or an admin tool.
skip-when: the product has no accounts and no private area.
---

# Auth

Authentication says who the caller is. Permission says what kind of thing they may do. Resource authorization says whether they may do it to this record. Keep the three layers separate, enforce each in one place, and let every layer deny by default.

## Rules

### Sign-in
- **AUTH-1: Use Better Auth with three methods: magic link by email, email + password, Google OAuth.**
  This is the default for most products. Drop a method only when the product brief says so. Use the latest stable version at build time.
- **AUTH-2: One user per verified email.**
  A second method for the same address links to the same user. Never create a duplicate account because the method differs.
- **AUTH-3: Link accounts only when both sides are verified.**
  A Google account links by email only when Google reports the email as verified, and the existing account's email is verified too. An unverified password account never absorbs an OAuth identity, and an OAuth identity never takes over an unverified account. This blocks pre-registration takeover.
- **AUTH-4: Sign-in responses are neutral.**
  "Check your inbox" and "wrong email or password" never reveal whether an address has an account. See [forms](forms.md) for the same rule on public forms.
- **AUTH-5: Rate-limit sign-in and magic link requests, per IP and per email.**
  Limits are stored in the database or a shared store, not in process memory. Magic links expire in minutes and work once.
- **AUTH-6: Dev-only auth shortcuts cannot exist in a deployed build.**
  A fake login for local work refuses to start when the app runs deployed (see [clients](clients.md)). A test override never ships in the production image.

### Route protection
- **AUTH-7: Protect routes in one place.**
  One middleware or proxy file holds the list of public paths and the redirect logic. Pages and handlers do not each re-implement "is there a session". Everything not listed as public needs a session.
- **AUTH-8: Redirects to sign-in carry `from` and `reason`.**
  `from` is the path to return to after sign-in, `reason` says why (`signin`, `expired`, `forbidden`). Accept `from` only as a relative path on the same host; reject anything else to avoid open redirects.
- **AUTH-9: Machine routes sit outside session middleware.**
  Health checks, webhooks, cron routes and the MCP endpoint ([mcp](mcp.md)) authenticate themselves. See [security](security.md).

### Layers
- **AUTH-10: Authentication, permission and resource authorization are separate layers.**
  Authenticate in the framework layer. Check permission ("may this role use this feature") at the entry of each use case. Authorize the resource ("is this record in this caller's scope") inside the service on every call, not only in the UI or the route.
- **AUTH-11: Empty scope means deny.**
  A caller with no memberships, no tenant, or an empty allow-list sees nothing. Never treat "no filter" as "all rows". Derive the tenant from the authenticated membership, never from a request parameter.
- **AUTH-12: Access policies are pure functions with unit tests.**
  A policy takes the caller and the resource and returns allow or deny. No I/O inside. Test every role against every action, including the deny cases and the empty-scope case.
- **AUTH-13: Read roles from the database on every request.**
  Do not trust a role stored in a token, cookie or client state. A revoked role takes effect on the next request. A flag is never an authorization control.
- **AUTH-14: Keep the browser session, provider tokens and app-issued API tokens separate.**
  Stored provider tokens are encrypted, bound to the account, and purged when the user is removed.

### Internal admin tools
- **AUTH-15: An identity-aware gateway (IAP style) is for pure internal admin tools only.**
  Use it when the tool has no roles or tenant data of its own. Anything with roles or customer data does its own auth. A gateway does not protect calls from inside the cluster, so in-cluster callers need their own control.

## How to apply

1. Install Better Auth with the repository adapter for the product's ORM. Enable the three methods. Send mail through the [email](email.md) wrapper.
2. Set the trusted base URL from the public URL resolver in [env-and-secrets](env-and-secrets.md). Set session lifetime and cookie flags (secure, httpOnly, sameSite lax).
3. Write the route protection file first, with an explicit public list. Add a test that walks the route registry and fails when a new route is neither public nor protected.
4. Define roles and one policy file per module. Call policies from use cases, never from components.
5. Seed the first admin through an environment-listed email or a one-off command, not a default password.
6. When changing a role or policy later, update its test first and check every caller of the policy.

## Checks

- Automated: policy unit tests (all roles, all actions, empty scope); route test that no route is unclassified; a test that a cross-tenant id returns not found; a test that a dev-only login refuses to start when deployed.
- Automated: a test that `from` rejects absolute and protocol-relative URLs.
- Review: every new use case calls a policy; no role is read from the client; no query lacks a tenant filter.

## Mistakes to avoid

- Linking a Google login to an existing password account without checking both emails are verified.
- Checking permission in the UI only, so a direct API call skips it.
- Treating an empty list of allowed tenants as "no restriction".
- Caching roles in the session so a removed admin keeps access until expiry.
- Putting an identity-aware gateway in front of an app that also holds customer data and calling that enough.
- Leaving a scaffold's unused sign-in method or dev login in place after copying a template.
