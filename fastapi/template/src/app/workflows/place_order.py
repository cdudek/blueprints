"""Workflow: place an order and record the durable payment request, in one transaction.

- Retry-safe? No: a retried POST creates a second order. API-level idempotency keys are deferred.
- Duplicates? One payment request per order, written in the same transaction as the order.
- Recovery? Both rows commit together or neither exists; the charge happens later in a job.
- Survives a restart? Yes: the payment request row is the durable intent; the sweeper wakes it.
"""

from app.db.transaction import in_transaction
from app.modules import billing, orders
from app.shared.auth import Principal


async def place_order(principal: Principal, data: orders.OrderCreate) -> orders.OrderOut:
    async with in_transaction() as tx:
        order = await orders.create_order(tx, principal, data)
        await billing.request_payment(tx, order.id, order.amount_cents, order.currency)
        return order
