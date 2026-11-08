---
name: fastapi-clients
description: Python Protocol clients, provider factories and deterministic fault injection
read-when: adding an external service, changing provider selection or testing recovery from vendor failures
skip-when: the change touches no network integration
---

# Clients

Core [clients](../../core/references/clients.md) owns the provider pattern, four outcomes, timeouts and idempotency. These are its Python seams.

## Rules

- **FCL-1 `base.py` holds a narrow `Protocol`.** Use async methods for async network I/O, our own input/output records and the CLI-16 outcome taxonomy. `factory.py` selects from `providers/real.py`, `fixture.py` (the fake) and `noop.py`. Only the client folder imports providers or vendor SDKs.
- **FCL-2 Build and close clients at process boundaries.** The FastAPI lifespan and worker startup validate settings, construct providers once per process and close pooled HTTP clients on shutdown. Pass the interface into operations or task runners; tests construct it directly. A worker validates its required integration before accepting work, even if no HTTP route uses it.
- **FCL-3 Inject transport into the real provider.** An HTTPX async transport or an explicitly passed HTTP function lets tests exercise serialization, headers, timeouts and response parsing. Parse provider responses into our types and translate exceptions there. A connection failure differs from a timeout after sending; vendor SDK exceptions never cross the interface.
- **FCL-4 The fixture implements the real idempotency contract.** Store the first result by persisted key. Script decline, unavailable, uncertain-after-send and success outcomes; uncertain-after-send records a charge before reporting uncertainty. Add a one-shot crash after the side effect and before local recording. Count calls and distinct effects separately.
- **FCL-5 Lack of provider idempotency requires a proven reconciliation protocol.** A reference lookup is useful only if the vendor's consistency and concurrency guarantees prevent another charge. A lookup returning nothing after a timeout is not proof no charge happened. Stop for reconciliation when uniqueness cannot be guaranteed; never advertise exactly-once behavior on the strength of a fake.

## How to apply

```text
clients/payments/
  __init__.py           exports Protocol, records, outcome types and factory
  base.py               charge(amount, currency, reference, persisted_key) -> outcome
  factory.py            Settings -> real | fixture | noop; fail closed
  providers/
    real.py             HTTPX transport, timeout, parsing and outcome translation
    fixture.py          results by key, scripted failures and one-shot crash hook
    noop.py             explicit inert behavior; refused when deployed
```

Implement the fixture and shared contract scenarios first, then the real provider against a fake transport. Wire the selection matrix from CLI-7 to CLI-10. When changing a provider, replay the same scenarios against both implementations without credentials or live network calls.

```text
fixture: charge(key) -> store result -> crash once
retry:   charge(same key) -> return stored result
assert:  two calls, one effect, unchanged provider reference
```

## Checks

Automatic: provider selection matrix, missing-credential startup failure, shared contract scenarios, real-provider transport tests and a suite-wide network guard. Include malformed success bodies and errors inside successful HTTP responses. Review: vendor idempotency retention, reference lookup consistency, redacted upstream diagnostics and retry classification. The fake cannot prove the vendor honors its contract.
