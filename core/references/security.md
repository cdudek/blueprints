---
name: security
description: Baseline web security rules: headers, CSP, host, secrets handling in code, untrusted input, uploads and error exposure.
read-when: adding a route, webhook, cron job, upload, user-generated text, an LLM call on user content, or changing headers.
skip-when: the change is pure copy or styling with no new input or output surface.
---

# Security

Treat every input as hostile and every failure as something to hide from the user and keep for the operator. Defaults are strict; each loosening is recorded in [decisions](decisions.md) with a reason.

## Rules

### Browser and host
- **SEC-1: Send the standard security headers on every response.**
  Strict transport security, `nosniff`, a referrer policy, a permissions policy, frame protection that fits the embedding topology, and no `X-Powered-By`. Set them in one place.
- **SEC-2: Use a strict nonce-based CSP.**
  A fresh nonce per request, no `unsafe-inline` for scripts, no wildcard hosts. Cached public pages (SEO-30) get the nonce replaced on each response, or use a hash-based policy. List a third-party host (analytics, captcha) only while that integration is on. Inline scripts that run before first paint hold compile-time constants only.
- **SEC-3: One canonical host.**
  Each environment has one canonical host. Every other host of that environment (www, old domains) redirects permanently to it. A preview host is the canonical host of its own preview. Revision health probes are exempt from the redirect. The canonical URL comes from the resolver in [env-and-secrets](env-and-secrets.md).
- **SEC-4: Not found and no access both return 404.**
  A caller must not learn that a record exists. Use 403 only where existence is already public.

### Secrets and tokens in code
- **SEC-5: Compare secrets in constant time and store tokens hashed.**
  Applies to API tokens, magic link tokens, invite codes and webhook signatures. Store only the hash; show the token once at creation.
- **SEC-6: Webhooks verify the signature over the raw bytes and fail closed.**
  Also check timestamp freshness, cap the body size, dedupe by event id, and persist the event before answering 200. Never leave work running after the response. A missing secret means reject, not skip.
- **SEC-7: Cron and job routes need a secret or a platform identity token.**
  An unauthenticated cron route is a public denial-of-service button. The check fails closed when the secret is not configured.
- **SEC-8: Use trusted proxy hops to read the client IP.**
  Trust forwarded headers only through the configured number of hops. See [forms](forms.md).

### Untrusted content
- **SEC-9: User text is untrusted at every output.**
  Render user Markdown through a small subset (paragraphs, emphasis, lists, links, code) with no raw HTML. Links get `rel` protections and only http, https and mailto.
- **SEC-10: Wrap user text as data before it reaches an LLM.**
  Put it in a clearly delimited envelope, state in the system prompt that the envelope is data and not instructions, and never give the model tools or secrets it does not need for that call. Validate model output with a schema before using it.
- **SEC-11: Uploads go through a signed URL, then a server check.**
  The browser uploads to storage with a short-lived signed URL. The server then checks type by content (not extension or declared type), enforces a size cap, re-encodes images, and only then marks the file usable. Store under UUID names in per-user paths. Accept only an allow-list of content types.

### Errors and limits
- **SEC-12: Users see an opaque error code or reference id; the log has the full error.**
  Provider messages, stack traces, SQL and file paths never reach the client. Return a request id the user can quote.
- **SEC-13: Every outbound call has a timeout.**
  This covers auth, flag, captcha, LLM and storage calls. Retry only transient errors, a bounded number of times.
- **SEC-14: Rate-limit by caller, not only at the edge.**
  Edge limits are not abuse control. Limit sensitive actions per user, IP and email, and say in the docs where the limit is coarse (for example per instance).
- **SEC-15: Scan dependencies and secrets in CI, and pin what CI runs.**
  The scanner list and pinning rules live in [ci](ci.md).

## How to apply

1. Create one headers module and one CSP builder. Generate the nonce in the proxy or middleware and pass it to the root layout.
2. Add a startup check that the canonical host is set in deployed environments.
3. Create a shared helper for constant-time compare and token hashing. Ban plain string equality on secrets in review.
4. For each webhook, write the verification first, then the handler. Add a replay test and a bad-signature test.
5. For uploads, write the allow-list and size caps in config, not inline.
6. When adding a third-party script, add its host to the CSP in the same change and make removal of the token switch both off.

## Checks

- Automated: a test that responses carry the header set; a test that the CSP has no `unsafe-inline` for scripts; a bad-signature webhook test; a cron route without a secret test; a cross-user record returns 404.
- Automated: secret and dependency scanning in CI ([ci](ci.md)).
- Review: new outputs of user text; new outbound calls without a timeout; any error body that echoes a provider message.

## Mistakes to avoid

- Calling the CDN's rate limit "abuse control".
- Verifying a webhook over parsed JSON instead of raw bytes.
- Acknowledging a webhook first and processing in a floating promise.
- Returning 403 for a record the caller is not allowed to know exists.
- Shipping with no CSP because inline scripts "were easier".
- Setting blanket frame protection in an app that must be embedded, or none in an app that must not.
- Letting a CAPTCHA, analytics or font host stay in the CSP after the integration is removed.
