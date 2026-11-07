"""Billing operations other modules and workflows call through the door."""

import uuid

from app.db.transaction import Tx
from app.modules import orders
from app.modules.billing import jobs, repository
from app.modules.billing.errors import PaymentRequestNotFoundError
from app.modules.billing.models import PaymentRequest
from app.modules.billing.schemas import PaymentRequestOut, PaymentRequestStatus
from app.shared.access import operation
from app.shared.auth import Principal


@operation(access="system")
async def request_payment(
    tx: Tx, order_id: uuid.UUID, amount_cents: int, currency: str
) -> PaymentRequestOut:
    """Writes the durable intent to charge once and defers its job, both in the caller's
    transaction: they commit together or not at all."""
    request = PaymentRequest(
        order_id=order_id,
        amount_cents=amount_cents,
        currency=currency,
        status=PaymentRequestStatus.REQUESTED,
    )
    row = await repository.add(tx, request)
    await jobs.wake(tx, row.id)
    return PaymentRequestOut.model_validate(row)


@operation(access="user")
async def get_payment_for_order(
    tx: Tx, principal: Principal, order_id: uuid.UUID
) -> PaymentRequestOut:
    """The latest payment request of an order the caller owns."""
    await orders.get_order(tx, principal, order_id)  # the access check: raises for other callers
    row = await repository.get_by_order(tx, order_id)
    if row is None:
        raise PaymentRequestNotFoundError(f"no payment request for order {order_id}")
    return PaymentRequestOut.model_validate(row)
