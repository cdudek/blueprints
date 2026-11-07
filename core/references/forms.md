---
name: forms
description: The pipeline every public (unauthenticated) human form submission passes through, and how signups and retries behave.
read-when: adding or changing a contact form, signup, waitlist, newsletter, feedback form, or any open write endpoint.
skip-when: the form sits behind sign-in and only authenticated users can reach it (then [auth](auth.md) and normal validation apply).
---

# Forms

An open form is an invitation to bots. Every public form runs the same three steps in the same order (machine routes such as webhooks, cron and MCP are excluded; they follow [security](security.md) and [mcp](mcp.md)): rate limit, reCAPTCHA v3, schema validation. The answer to the visitor never reveals what the server knows, and a failed write never costs the visitor their input.

## Rules

### Pipeline
- **FORM-1: Order is rate limit, then reCAPTCHA v3, then schema validation.**
  Cheap checks run first. Validation comes last so a bot learns nothing about the schema. Put the pipeline in one shared function; forms do not assemble it by hand.
- **FORM-2: Rate limit by IP and by email.**
  Both counters apply. Store them in the database or a shared store. Return the same generic response when limited, with a retry hint, not the counter.
- **FORM-3: Check the reCAPTCHA v3 score and the action.**
  The token's action must match the form's action name, and the score must meet the form's threshold. Verify on the server. Put the threshold in config, per form.
- **FORM-4: Fail open on a provider outage, fail closed on a bad verdict.**
  If the captcha service times out or errors, let the request through (the rate limit still protects you) and log it. If it answers and the score or action is wrong, reject. A missing secret in a deployed build fails closed.
- **FORM-5: Show the legal notice when the badge is hidden.**
  If you hide the reCAPTCHA badge, put the required Google privacy and terms notice in the form text. Load the script only on pages with a form.
- **FORM-6: Captcha sits behind a provider interface.**
  Real, fake and noop providers, per [clients](clients.md). E2E tests use the fake provider in fixture mode.

### Client identity
- **FORM-7: Read the client IP through configured trusted proxy hops.**
  Count proxies from the right of the forwarded header up to the configured number. With zero configured hops, ignore forwarded headers. Trusting all of them lets anyone spoof an IP and dodge the limit.

### Signups and responses
- **FORM-8: Use double opt-in for any list or newsletter.**
  Store the address as pending, send a confirmation link, and subscribe only after the click. Keep the proof (time, IP hash, form).
- **FORM-9: The response never reveals whether an address exists.**
  A new address, a pending one and a known one all get the same success message. Duplicates return success. Mail the existing user instead of telling the form.
- **FORM-10: Writes carry an idempotency key.**
  The client sends a key generated when the form loads. The server stores it with the result and replays that result on a retry. A disabled button does not cover network retries or double submits.

### Visitor experience
- **FORM-11: Never lose input.**
  On a failed write, a rate limit, or a captcha reject, keep every field filled, show what happened in plain words, and let the visitor retry. Validate inline on the client with the same schema the server uses.
- **FORM-12: Errors name the field and the fix.**
  Server errors map to fields. Anything unexpected shows an opaque reference id ([security](security.md)) and keeps the input.

## How to apply

1. Define the form's zod schema once in the module; client and server both import it.
2. Choose the action name and score threshold, and add them to config.
3. Call the shared pipeline from the server action or route. Pass IP, email, token and action.
4. Add the fake captcha provider (fixture mode) for tests and the noop provider for local work.
5. Add the confirmation mail template for double opt-in ([email](email.md)).
6. Generate the idempotency key on mount and send it with the submit.
7. When changing a form later, keep the action name stable and re-check the threshold against real scores.

## Checks

- Automated: a test per pipeline step (limited, bad score, wrong action, provider down, invalid body); a test that two submits with one key create one record; a test that existing and new addresses get identical responses (body and status).
- Automated: a test that forwarded headers are ignored with zero trusted hops.
- Review: no unauthenticated human submission bypasses the shared pipeline (machine routes are excluded); the legal notice is present where the badge is hidden.

## Mistakes to avoid

- Validating first, which lets a bot probe the schema for free.
- Failing closed when the captcha provider is down, which takes the signup page down with it.
- Trusting the first value of `X-Forwarded-For`.
- Telling the visitor "this email is already registered".
- Clearing the form on a server error.
- Hiding the badge and forgetting the legal text.
- Using the captcha as the only defense, with no rate limit behind it.
