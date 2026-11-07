"""HTTP for billing. Imported only by `app.api`."""

import uuid

from fastapi import APIRouter

from app.db.transaction import in_transaction
from app.modules.billing.schemas import PaymentRequestOut
from app.modules.billing.service import get_payment_for_order
from app.shared.http import CurrentUser

router = APIRouter(prefix="/v1/orders", tags=["billing"])


@router.get("/{order_id}/payment")
async def read_payment(order_id: uuid.UUID, principal: CurrentUser) -> PaymentRequestOut:
    async with in_transaction() as tx:
        return await get_payment_for_order(tx, principal, order_id)
