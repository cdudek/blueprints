"""Order operations: plain functions taking `tx` (and `principal` for user operations)."""

import uuid

from app.db.transaction import Tx
from app.modules.orders import repository, rules
from app.modules.orders.errors import OrderNotFoundError
from app.modules.orders.models import Order
from app.modules.orders.schemas import OrderCreate, OrderOut, OrderStatus
from app.shared.access import operation
from app.shared.auth import Principal


@operation(access="user")
async def create_order(tx: Tx, principal: Principal, data: OrderCreate) -> OrderOut:
    order = Order(
        customer_id=principal.subject,
        amount_cents=data.amount_cents,
        currency=data.currency,
        status=OrderStatus.PENDING_PAYMENT,
    )
    return OrderOut.model_validate(await repository.add(tx, order))


@operation(access="user")
async def get_order(tx: Tx, principal: Principal, order_id: uuid.UUID) -> OrderOut:
    order = await repository.get(tx, order_id)
    # Another customer's order is reported as missing, so ids cannot be probed.
    if order is None or order.customer_id != principal.subject:
        raise OrderNotFoundError(f"order {order_id} not found")
    return OrderOut.model_validate(order)


async def _move(tx: Tx, order_id: uuid.UUID, target: OrderStatus) -> None:
    if await repository.set_status_if(tx, order_id, rules.sources_of(target), target):
        return
    # Lost the conditional update: reload and decide, never report success blindly.
    current = await repository.status_of(tx, order_id)
    if current is None:
        raise OrderNotFoundError(f"order {order_id} not found")
    if current is not target:
        rules.ensure_transition(current, target)


@operation(access="system")
async def mark_paid(tx: Tx, order_id: uuid.UUID) -> None:
    """Idempotent: an order that is already paid stays paid."""
    await _move(tx, order_id, OrderStatus.PAID)


@operation(access="system")
async def mark_payment_failed(tx: Tx, order_id: uuid.UUID) -> None:
    await _move(tx, order_id, OrderStatus.PAYMENT_FAILED)
