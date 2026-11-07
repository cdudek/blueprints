"""Queries for orders. Private to the module; takes `tx` and never commits."""

import uuid
from collections.abc import Iterable

from sqlalchemy import select, update

from app.db.transaction import Tx
from app.modules.orders.models import Order
from app.modules.orders.schemas import OrderStatus


async def add(tx: Tx, order: Order) -> Order:
    tx.add(order)
    await tx.flush()
    return order


async def get(tx: Tx, order_id: uuid.UUID) -> Order | None:
    return await tx.get(Order, order_id)


async def set_status_if(
    tx: Tx, order_id: uuid.UUID, from_statuses: Iterable[OrderStatus], to: OrderStatus
) -> bool:
    """A conditional update: True only if this call moved the order. Never a blind write."""
    result = await tx.execute(
        update(Order)
        .where(Order.id == order_id, Order.status.in_(list(from_statuses)))
        .values(status=to)
        .returning(Order.id)
    )
    return result.scalar_one_or_none() is not None


async def status_of(tx: Tx, order_id: uuid.UUID) -> OrderStatus | None:
    return await tx.scalar(select(Order.status).where(Order.id == order_id))
