# The worked slice: order, durable payment request, worker, result

This slice is the reference for every process in this template that calls something outside the
database. It shows who owns each transaction, how a payment survives a crashed worker, and what the
tests prove. Code: `src/app/workflows/place_order.py`, `src/app/modules/billing/`,
`src/app/clients/payments/`, `src/app/db/queue.py`, `src/app/worker.py`. Tests:
`tests/integration/test_slice.py`, `test_worker.py`, `test_place_order.py`.

## The flow

1. `POST /v1/orders` calls the `place_order` workflow, which owns one transaction:
   - `orders.create_order()` writes the order as `pending_payment`;
   - `billing.request_payment()` writes a `payment_requests` row (`requested`, with an
     `idempotency_key` generated once, unique);
   - the same call defers the job `billing.process_payment_request` on the same connection.

   All three commit together or none exists. The row is the durable intent; the job is a wake-up.
2. The job, transaction 1: a conditional update claims the row (`requested`, or `processing` whose
   claim is older than the stalled-worker timeout, becomes `processing`, `attempts + 1`) and
   commits. No row changed means another worker has it, or it is finished: the job stops.
3. Outside any transaction: `payments.charge(..., reference=<request id>,
   idempotency_key=<the row's key>)`.
4. Transaction 2: a conditional update to `succeeded` with the provider reference, and
   `orders.mark_paid()`. A lost conditional update is reloaded and checked, never reported as
   success.

## States and how each one resumes

| State | Meaning | Resumes by |
| --- | --- | --- |
| `requested` | waiting for a worker | its job; the sweeper defers a new one if the job is gone |
| `processing` | a worker claimed it | the same worker finishing; after a crash, the stalled-job retry or the sweeper re-runs the job, which reclaims the stale claim and charges again with the same key |
| `succeeded` | charged and recorded; the order is `paid` | final |
| `failed` | a definite decline; the order is `payment_failed` | final; a new attempt is a new request with a new key |
| `needs_attention` | the maximum attempts ran out; an alert-level log event was written | a person |

## Retry rules

- The key belongs to the request row and never changes. A new key only comes with a new request.
- A transient error (`PaymentUnavailableError`) or an unknown outcome
  (`PaymentOutcomeUnknownError`, for example a timeout after sending) puts the row back to
  `requested` and raises `RetryLaterError`; the queue retries with exponential backoff and the
  same key.
- A definite decline sets `failed` and the order `payment_failed`. No retry.
- After `MAX_ATTEMPTS` (5) claims the row goes to `needs_attention` and the job stops.
- A worker that dies leaves its job `doing`. Workers heartbeat every 10 seconds; the periodic
  `retry_stalled_jobs` task puts jobs of workers silent for 30 seconds back in the queue
  (Procrastinate's documented `get_stalled_jobs` and `retry_job` recipe).
- The periodic sweeper (`billing.wake_stale_payment_requests`) defers a job for every `requested`
  or `processing` row untouched for 30 seconds whose job is not already waiting. It is the
  safety net for jobs that failed for good or vanished.
- Compensation (not in this slice): cancelling a paid order defers a refund job with its own
  request row and key.

## The provider contract

The payments port requires idempotency keys: a repeated key returns the first result and never
charges twice. A provider without them must look up a charge by our reference before charging,
inside its provider file. The fixture provider implements the key semantics and is the oracle of
the tests; it also takes a fault hook (`raise_after_charge`) and a script of outcomes.

## What the tests prove

| Test | Proves |
| --- | --- |
| `test_payment_succeeded_but_the_worker_died_before_recording_it` | a worker charges and dies with its job `doing`; the stalled-job retry re-runs it; exactly one charge, request `succeeded`, order `paid` |
| `test_two_claims_on_two_connections_one_wins` | the second claim waits on the row lock and gets nothing once the first commits |
| `test_two_workers_race_for_one_request` | two workers, one provider call, one claim |
| `test_a_decline_fails_the_order_without_retry` | decline: `failed`, `payment_failed`, no charge |
| `test_unknown_outcome_then_success_charges_once` | a timeout after sending, then a retry with the same key: one charge |
| `test_maximum_attempts_reach_needs_attention` | five transient failures: `needs_attention`, one alert-level event, a later wake-up changes nothing |
| `test_a_failing_payment_request_rolls_back_the_order` | `place_order` failing inside `billing.request_payment()`: no order, no request, no job |
| `test_placing_an_order_defers_one_job_in_the_same_transaction` | the deferral is part of the workflow's transaction |
| `test_the_sweeper_wakes_a_request_whose_job_is_gone` | a request whose job was deleted is charged once after the sweep |

Worker and concurrency tests commit for real: under Read Committed, Postgres's default, a second
connection or the worker never sees uncommitted data. Each test module gets its own database,
cloned from a migrated template with `CREATE DATABASE ... TEMPLATE` and dropped afterwards.
Repository and service tests use a transaction per test that is rolled back.

## Decision: deferring inside the SQLAlchemy transaction (build spike, 2026-11-07)

Procrastinate 3.10 accepts an external connection on `configure(connection=...)`. The job is
written on the psycopg connection under the SQLAlchemy session, so it commits or rolls back with
the payment request (spike: a rolled-back transaction left no job, a committed one left one; now
`test_a_failing_payment_request_rolls_back_the_order`). Every deferral goes through
`app.db.queue.defer_in`, which uses a savepoint so a job already waiting under the same queueing
lock is skipped without aborting the caller's transaction. The sweeper is kept as the safety net
described above, not as a replacement for atomic deferral.
