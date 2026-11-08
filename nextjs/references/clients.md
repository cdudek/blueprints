---
name: nextjs-clients
description: TypeScript provider interfaces and factories for email, storage, LLMs and payments, including webhook and job recovery
read-when: adding an external service, selecting a provider, accepting a webhook or scheduling durable work
skip-when: changing pure rules or a database query with no external call
---

# Clients

Apply [core clients](../../core/references/clients.md) and [email](../../core/references/email.md). The factory selects a provider strategy behind a narrow TypeScript contract. Vendor SDKs never become a second application API.

## Rules

- **NEXT-CLIENT-1 One factory per service.** `clients/<service>/` contains the contract, `factory.ts` and `providers/`. Callers import the factory or its declared client entry; only that folder imports vendor packages. Providers receive configuration and transport as dependencies, not ambient reads scattered through methods. Return domain values and closed error codes, not SDK responses.
- **NEXT-CLIENT-2 Make configuration modes explicit.** The factory selects a real provider, a deterministic fake for tests and development, or a deliberate no-op where absence is safe. Production startup refuses missing required configuration, fakes and accidental no-ops. Identify production independently of `NODE_ENV`, because Playwright and previews also run production builds. Test that setting a test-mode flag cannot weaken the real production environment.
- **NEXT-CLIENT-3 Keep secrets and Node SDKs out of browser closures.** Server providers and factories are `server-only`. A browser analytics adapter has a separate safe entry and public configuration only. Server env values never cross a DTO or become `NEXT_PUBLIC_*`. Follow [core env and secrets](../../core/references/env-and-secrets.md).
- **NEXT-CLIENT-4 Contracts reflect each service's failure model.** Use the following adapters as needed, without installing unused providers.

| Client | TypeScript contract and delivery detail | Proof |
| --- | --- | --- |
| Email | Resend provider, React Email templates with HTML and text, recipient locale and stable send identity | Mail harness exercises the real sign-in link and delivery retry |
| Storage | Authorize the object in its module before issuing a short-lived signed URL; completion verifies size, media type and actual object before committing ownership | Expired URL, wrong owner and malformed upload are refused |
| LLM | Task-shaped inputs and validated structured outputs, timeout, cancellation, usage and cost recording; model IDs stay in provider config | Malformed output, throttling and unknown send outcome use deterministic fakes |
| Payments | Persist attempt identity, terms, correlation and idempotency key before calling; verify raw webhook signatures and store an inbox event before acknowledging | Duplicate and reordered callbacks, early arrival and refund recovery |

- **NEXT-CLIENT-5 Acknowledgment requires recoverable state.** A payment event can arrive before the provider call's response is saved. Store unmatched verified events, then reconcile them after linkage. Duplicate events do nothing twice; older events cannot move a terminal state backward. A cancellation racing a successful capture records a refund intent. The owning module controls these transitions; HTTP adapters do not.
- **NEXT-CLIENT-6 Every durable intent has a consumer and an end state.** A queue or scheduled route drains the inbox and outbox with stable persisted idempotency keys, bounded retries, backoff and an alertable terminal failure. Define abandoned-work cleanup and a stale-work recovery rule that checks progress and uses a conditional update. In-memory promises and framework post-response hooks are only for expendable work, not the sole path to payment, email or deletion completion.

## How to apply

Write the contract and failure cases first, then a fake and the real provider. Have the module service call the factory. For multi-step work, follow core's workflow contract, naming the persisted state after each commit and how a later run resumes or compensates.

Changing providers: run contract tests against both adapters, keep persisted correlations compatible, and change the factory selection without editing business callers. Switching an SDK is not permission to lose in-flight jobs.

## Checks

- Automatic: provider imports stay inside the client; outbound network is blocked unless a test supplies a transport; configuration-matrix tests refuse unsafe production modes.
- Automatic: payment replay, out-of-order delivery, event-before-linkage, lost updates, stable retry keys, unmatched-event reconciliation, dead-letter and stale-worker cases run through real operations and Postgres.
- Review: timeout and retry semantics, signatures, idempotency at the vendor, redacted logs and whether every persisted intermediate state has a recovery path.

## Mistakes to avoid

- A fake real-provider implementation that succeeds without talking to a vendor.
- An inbox table that no worker ever drains.
- A retry key derived from a worker run rather than the original attempt.
