"""HTTP for orders. Imported only by `app.api`."""

import uuid

from fastapi import APIRouter

from app.db.transaction import in_transaction
from app.modules.orders.schemas import OrderOut
from app.modules.orders.service import get_order
from app.shared.http import CurrentUser

router = APIRouter(prefix="/v1/orders", tags=["orders"])


@router.get("/{order_id}")
async def read_order(order_id: uuid.UUID, principal: CurrentUser) -> OrderOut:
    async with in_transaction() as tx:
        return await get_order(tx, principal, order_id)
