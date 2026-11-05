# Worked slice: orders and billing

The failure cases a payment flow must survive, each linked to the test that proves it. A test
(`tests/tooling/worked-slice.test.ts`) fails if a linked test no longer exists, so this list
cannot drift from the code.

| Guarantee                                                                      | Test file                                     | Test name                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Double submit: one order, one payment                                          | `src/modules/orders/order.service.test.ts`    | "is safe under a double submit: one order, one payment"                             |
| Concurrent submits of one checkout create one row                              | `src/modules/orders/order.repository.test.ts` | "returns the same order for concurrent submits of one checkout"                     |
| Retry with a changed product or quantity is a conflict                         | `src/modules/orders/order.service.test.ts`    | "returns a conflict when a retry changes product or quantity"                       |
| One user's checkout id never resolves to another user's order                  | `src/modules/orders/order.service.test.ts`    | "never resolves another user's checkout id to their order"                          |
| A retry keeps the agreed terms when the catalog changed                        | `src/modules/orders/order.service.test.ts`    | "resumes a checkout with its persisted terms even if the product is no longer sold" |
| Replaying a cancelled checkout starts no payment                               | `src/modules/orders/order.service.test.ts`    | "starts no payment when a cancelled checkout is replayed"                           |
| Retrying a paid checkout starts no second payment                              | `src/modules/orders/order.service.test.ts`    | "starts no second payment when a paid checkout is retried"                          |
| Cancel racing the payment webhook is never paid-and-cancelled without a refund | `src/modules/orders/order.service.test.ts`    | "keeps the order and its payment consistent when cancel races the payment webhook"  |
| Cancelling a paid order records a refund                                       | `src/modules/orders/order.service.test.ts`    | "cancelling a paid order records a refund, never paid-and-cancelled without one"    |
| A cancel changes nothing once the order changed under it                       | `src/modules/orders/order.repository.test.ts` | "refuses to cancel an order that changed since it was read"                         |
| A lost conditional update is recomputed, not reported as success               | `src/modules/billing/billing.service.test.ts` | "recomputes after a lost conditional update instead of reporting success"           |
| The same webhook event twice changes state once                                | `src/modules/billing/billing.service.test.ts` | "changes state once when the same event is delivered twice"                         |
| An out-of-order event never moves an attempt backwards                         | `src/modules/billing/billing.service.test.ts` | "never moves an attempt backwards on an out-of-order event"                         |
| Late payment success after a cancel becomes a refund                           | `src/modules/billing/billing.service.test.ts` | "records a refund when success arrives after a cancel"                              |
| An event that beats our own bookkeeping still finds its payment                | `src/modules/billing/billing.service.test.ts` | "finds its payment when the event beats our own bookkeeping (before attachIntent)"  |
| An unmatched event is stored before it is acknowledged                         | `src/modules/billing/billing.service.test.ts` | "stores an unmatched event in the inbox before it is acknowledged"                  |
| A cancelled attempt never gets a fresh intent                                  | `src/modules/billing/billing.service.test.ts` | "never gives a cancelled attempt a fresh intent"                                    |
| A payment cannot exist for a missing order (foreign key)                       | `src/modules/billing/billing.service.test.ts` | "refuses a payment for an order that does not exist (foreign key)"                  |
| The worker cancels an open intent at the provider                              | `src/modules/billing/billing.service.test.ts` | "cancels the open intent at the provider"                                           |
| The worker refunds a captured payment                                          | `src/modules/billing/billing.service.test.ts` | "refunds a captured payment"                                                        |
| The worker retries after a provider failure                                    | `src/modules/billing/billing.service.test.ts` | "retries after a provider failure and counts the attempt"                           |
| The webhook route rejects a missing or wrong signature                         | `src/app/api/webhooks/payments/route.test.ts` | "answers 400 without a signature and on a bad one"                                  |
| The webhook route marks the order paid once, duplicates included               | `src/app/api/webhooks/payments/route.test.ts` | "marks the order paid, and a duplicate delivery changes nothing more"               |
| The cron route refuses a missing or wrong secret                               | `src/app/api/cron/payments/route.test.ts`     | "rejects a missing or wrong secret"                                                 |
| Every operation declares an access policy                                      | `src/modules/billing/billing.service.test.ts` | "declares one policy per operation, none of them implied by a name"                 |

## Not implemented

These guarantees are deliberately unfinished in the template. Do not mistake the example for
production-ready payment handling.

- **Reconciler for `payment_inbox`.** Unmatched events are stored before the webhook is
  acknowledged, but nothing consumes them yet. Add a job that matches them once the attempt is
  linked, or raises an alert.
- **Abandoned-checkout cleanup.** A pending order that is never paid stays pending. Add a job
  that cancels it after the checkout lifetime you choose.
- **Dead-letter and alerting for the payment worker.** A failed provider call is retried on the
  next run and counted in `payments.attempts`; nothing stops retrying or alerts a human.
- **A real provider.** `clients/payments/providers/real.ts` is a stub against a placeholder
  endpoint, guarded to production. Map your vendor's API to the port.
- **A real session.** `shared/auth.ts` reads a cookie so the example runs; it refuses production
  unless the E2E job sets `AUTH_STUB=e2e`.
