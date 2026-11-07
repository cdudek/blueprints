"""HTTP entry points for workflows that start with an order."""

from fastapi import APIRouter, status

from app.modules.orders import OrderCreate, OrderOut
from app.shared.http import CurrentUser
from app.workflows.place_order import place_order

router = APIRouter(prefix="/v1/orders", tags=["orders"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_order(data: OrderCreate, principal: CurrentUser) -> OrderOut:
    return await place_order(principal, data)
