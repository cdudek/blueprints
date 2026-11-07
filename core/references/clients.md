---
name: clients
description: How a product talks to any external service called over the network: interface, factory, providers, errors, timeouts, cost.
read-when: adding or changing an integration (email, storage, LLM, payments, SMS, search, CRM, captcha), or writing tests that touch one.
skip-when: the change touches no external service.
---

# Clients

Every external service called over the network sits behind a narrow interface, built by a factory, with a real provider, a fake provider and a noop provider. The one idea: the rest of the product depends on what we need from the service, never on the vendor, so tests, local work and agents run without credentials and no test can reach a live API.

## Rules

### Shape

- **CLI-1 One folder per service.** It holds the interface, the factory and a `providers/` folder. The interface is named after the business operation (send a mail, store a file, charge a payment), with plain inputs and outputs and a closed set of results and errors.
- **CLI-2 Three providers.** `real` talks to the vendor. `fake` is a console, memory or fixture version for local work and tests. `noop` accepts everything and does nothing. Add `fake` behaviour that matters (a failing mode, a slow mode) rather than mocking in each test.
- **CLI-3 Vendor types never leak.** SDK types, vendor error classes and raw response shapes stay inside the provider. The interface returns our own types.
- **CLI-4 Providers are imported only inside their client folder.** Everyone else imports the interface and the factory.
- **CLI-5 The owning module calls the client.** Orders never talk to the payment provider, billing does. Clients are built once per process and injectable for tests.
- **CLI-6 Pass a persisted correlation id.** The client carries an id we stored before the call, so a vendor event finds its record even if it arrives before our bookkeeping finishes.

### Selection and safety

- **CLI-7 The factory picks the provider from configuration.** Real only when deployed with its credentials. Local and test default to `fake`.
- **CLI-8 Dev-only providers refuse to run deployed.** `fake` and `noop` can accept a forged signature or everything. The factory throws at startup in a deployed environment, unless an explicit end-to-end flag allows it. A configuration matrix test pins every combination.
- **CLI-9 A missing production credential raises a named error.** It never silently selects an inert provider. An optional integration is switched off explicitly, not by accident.
- **CLI-10 Tests stub the network to throw.** The global fetch or HTTP layer fails any test that tries a live call. The real provider takes its HTTP function as a parameter, so tests exercise it with a fake transport.

### Calls

- **CLI-11 Every call has a timeout.** Auth, flag and captcha dependencies included. Close pooled clients at shutdown.
- **CLI-12 Retry only transient errors, bounded, with backoff.** Reads may retry. Writes retry only with an idempotency key derived from a persisted id, never from the run.
- **CLI-13 No external call inside a database transaction.** Record the intent, commit, then call, usually from a job. See [structure](structure.md).
- **CLI-14 Read errors hidden inside success responses.** Some vendors answer HTTP 200 with an error list in the body. The provider checks it.
- **CLI-15 Redact before logging.** Upstream error bodies are logged in full for the team after redaction and never shown to users. Users get an opaque code or reference id.

### Error taxonomy

- **CLI-16 Four outcomes, never one generic failure.** The interface reports each separately:
  - connection failure: the request never reached the vendor, safe to retry.
  - uncertain outcome: it may have succeeded (timeout after sending, dropped response). Do not retry blindly: look it up by correlation id or idempotency key.
  - definite decline: the vendor said no (card refused, address invalid). Do not retry. Show the user a clear message.
  - retryable: the vendor said try later (rate limit, 5xx). Retry with backoff.

### AI calls

- **CLI-17 LLM clients read the model name from configuration** and use structured output. Failure classes are separate: configuration, transport, bad response.
- **CLI-18 Paid AI and scrape calls write to a cost ledger.** One row per call: user, task, provider, model, prompt version, tokens or units, cost, outcome. The ledger answers "what did this feature cost last month".
- **CLI-19 Untrusted text is data.** Wrap user content before it reaches a model and never let it choose tools or targets.

### Not behind a factory

- **CLI-20 The database is not a client.** Postgres is accessed through the ORM, only via each module's repository, and tests run against a real Postgres. A fake database proves nothing about locks, constraints or transactions, and a repository interface with one implementation is abstraction nobody needs.

## How to apply

Pseudocode of the pattern:

```text
# clients/mail/interface
Mail.send(message: {to, subject, text, html?}, idempotencyKey) -> Result<Sent, MailError>
MailError = connection_failure | uncertain | declined | retryable

# clients/mail/factory
createMail(env):
  match env.MAIL_PROVIDER:
    "real": require env.MAIL_API_KEY else throw MissingCredential("MAIL_API_KEY")
            return RealMail(env.MAIL_API_KEY, fetch, timeoutMs)
    "fake": if env.DEPLOYED and not env.E2E_ALLOW_FAKE: throw RefusedInDeployment("fake mail")
            return FakeMail()      # console or memory
    "noop": same refusal as fake
```

New product:

1. List every external service the product calls over the network. Anything not on the list is not a client.
2. For each, create the folder with interface, factory and the three providers. Write the fake first, so the product runs locally with no credentials.
3. Add the configuration keys to the env module and `.env.example` (see [env-and-secrets](env-and-secrets.md)). Use the same provider-selection key naming for every client.
4. Add the network-stub guard to the test setup and the configuration matrix test.
5. Map vendor errors to the four outcomes inside the real provider.
6. For paid AI calls, add the ledger table to the module that owns the feature.

Changing later: change the interface only for what the product needs, not for what the vendor offers. Swapping a vendor means writing one provider. Keep a read-only contract probe against the real vendor schema (a scheduled job or manual command), because fakes cannot catch vendor drift.

## Checks

Automatic:

- Only the factory imports providers. Only client folders import vendor SDKs.
- The factory throws for `fake` and `noop` in a deployed environment (matrix test).
- The test setup fails any live network call.
- Every real provider call passes a timeout (lint or test on the HTTP wrapper).
- No client call inside a transaction callback.
- Error mapping tests per provider cover all four outcomes.

Review: that the interface stays narrow, that retries use persisted idempotency keys, that redaction covers free text, and that cost ledger rows exist for every paid call.

## Mistakes to avoid

- A fake provider that is more forgiving than production, so tests pass and prod fails.
- Treating a timeout as a failure and retrying a charge or a send, which duplicates it.
- A factory that falls back to `noop` when a key is missing. The product runs and does nothing.
- Vendor error classes caught in the UI layer.
- Logging full upstream response bodies that contain user data.
- A client interface that mirrors the vendor API instead of what the product needs.
- Paid AI calls with no record of who triggered them.
- A non-EU vendor added without recording it as an exception (see [legal](legal.md)).
