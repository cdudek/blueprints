"""Billing operations other modules and workflows call through the door."""

import uuid

from app.db.transaction import Tx
from app.modules.billing import repository
from app.modules.billing.models import PaymentRequest, PaymentRequestStatus
from app.modules.billing.schemas import PaymentRequestOut
from app.shared.access import operation


@operation(access="system")
async def request_payment(
    tx: Tx, order_id: uuid.UUID, amount_cents: int, currency: str
) -> PaymentRequestOut:
    """Writes the durable intent to charge once. The caller's transaction commits it."""
    request = PaymentRequest(
        order_id=order_id,
        amount_cents=amount_cents,
        currency=currency,
        status=PaymentRequestStatus.REQUESTED,
    )
    return PaymentRequestOut.model_validate(await repository.add(tx, request))
