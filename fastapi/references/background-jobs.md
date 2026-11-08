---
name: fastapi-background-jobs
description: Postgres-backed jobs, atomic outbox deferral and crash-safe payment processing
read-when: adding a background task, payment flow, retry, scheduler or cross-module recovery process
skip-when: the change touches no durable asynchronous work
---

# Background jobs

Core [data and migrations](../../core/references/data-and-migrations.md) DAT-9 to DAT-13 defines durability and at-least-once execution. Core STR-15 in [structure](../../core/references/structure.md) defines workflows. This reference maps them to a Python worker and a payment example.

## Rules

- **FJOB-1 Prefer a Postgres queue while one database suffices.** Procrastinate is the default Python queue. Register tasks from declared `jobs.py` doors at worker startup. Tasks are delivery adapters calling job operations or named workflows; they do not bypass repositories or open their own unit transactions. Never use FastAPI `BackgroundTasks` for work that must survive process death.
- **FJOB-2 Prove enqueue shares the write's transaction.** Keep queue coupling in `db/queue.py`. If the selected queue and driver support an external connection, use the underlying psycopg connection of the SQLAlchemy transaction and prove commit/rollback behavior. A duplicate queueing lock may roll back a local savepoint without aborting business writes. If this cannot be established with the current stable APIs, write an outbox row on the same session and dispatch it later. An independent queue connection is not atomic.
- **FJOB-3 Claim, call, record are separate steps.** A billing operation conditionally claims a request and commits its attempt and lease; the task runner calls the provider outside a transaction; a second billing operation records the result. Retryable and uncertain outcomes retain the same persisted idempotency key. Definite declines stop; exhausted work enters `needs_attention` with an alert and a documented reconciliation/redrive path. Never reset the attempt budget just because the queue created a new task.
- **FJOB-4 Align leases with provider deadlines and worker recovery.** Expired leases are reclaimable, with a claim token or version to fence stale writers. Provider idempotency protects the external effect even if a slow worker overlaps a reclaim. Heartbeats and stalled-job recovery use measured timeouts; a periodic sweeper wakes unfinished intents whose queue jobs disappeared. The sweeper does not revive final or exhausted requests.
- **FJOB-5 Persist cross-module progress instead of opening a workflow transaction.** Each module's service operation owns its write and outbox intent. A named workflow resumes from persisted steps and calls module doors, idempotently, with no shared transaction. For order/payment placement, orders commits the order and an order-owned intent; billing creates its payment request idempotently from that intent. After billing records success, durable workflow progress updates the order through its door. A crash between those operations resumes the outstanding step. This keeps STR-15 and avoids a billing/orders dependency cycle.
- **FJOB-6 Queue names and payloads are published contracts.** Use stable names and small versioned payloads, usually persisted ids rather than ORM records or secrets. Keep old task names and additive payload readers until old workers and queued payloads are gone, following core compatibility. Scheduler timezone, overlap policy and runtime limit belong in the product runbook.

## How to apply

```text
orders operation: commit order + outbox intent(intent id)
workflow:         ensure billing request exists for intent id; record progress
billing claim:    requested or expired processing -> processing; attempts + 1; lease token
outside tx:       charge(reference=request id, key=request's fixed key)
billing record:   compare claim token -> succeeded | failed | requested | needs_attention
workflow:         apply final order state through orders door; record completion
```

The payment lifecycle is small enough to review:

| State | Resume rule |
| --- | --- |
| `requested` | Claim from a queued wake-up; sweeper restores a lost wake-up. |
| `processing` | Current lease finishes; stalled or expired work can be reclaimed. |
| `succeeded` | Final payment result; workflow retries any outstanding order update. |
| `failed` | Definite decline; no automatic charge retry. |
| `needs_attention` | Budget exhausted; a person reconciles before redrive. |

Start with a persisted intent and its recovery rules, then implement the worker. The [fixture provider](clients.md) scripts uncertainty and a crash after charge to exercise every recovery path. For a new task, write down retry safety, duplicate behavior, recovery and restart survival before wiring it to a request. Worker idempotency does not make `POST /orders` idempotent: an API retry needs its own persisted request key if the product promises that behavior.

## Checks

Automatic on real Postgres: business write plus enqueue/outbox commit together and roll back together; duplicate enqueue leaves the transaction usable; two claims on separate connections yield one current lease. Test worker death after charging, uncertainty then success, a decline, exhaustion, stale-writer fencing, lost jobs and a crash between workflow steps. Assert distinct external effects, not just task count. Review: vendor idempotency retention and reconciliation guarantees (FCL-5), compensation such as refunds, and operational redrive permissions.
