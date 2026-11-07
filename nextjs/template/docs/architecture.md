# Architecture at a glance

Generated from `architecture.json` by `pnpm arch:diagram`. CI fails when this diagram is stale,
so it cannot drift from the policy the checks enforce.

Solid arrows are declared module edges (the caller uses the callee's `server.ts`). Dashed arrows
are declared read exceptions. Cylinders are third-party ports under `src/clients`. Every table has
one owning module.

<!-- architecture-diagram:start -->
```mermaid
flowchart LR
  orders["<b>orders</b><br/>Placing, listing and cancelling orders<br/>tables: orders"]
  billing["<b>billing</b><br/>Prices and payment attempts for orders<br/>tables: prices, payments, payment_inbox"]
  orders -->|uses a door| billing
  client_payments[("client: payments")]:::port
  classDef port stroke-dasharray: 4 2
```
<!-- architecture-diagram:end -->

The rules behind the diagram are in [ARCHITECTURE.md](../../ARCHITECTURE.md) (sections 4, 5, 7, 11).
