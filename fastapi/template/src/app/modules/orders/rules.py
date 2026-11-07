"""Pure decisions about orders: no database, clock, randomness or environment."""

from app.modules.orders.errors import InvalidOrderTransitionError
from app.modules.orders.models import OrderStatus

ALLOWED: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.PENDING_PAYMENT: frozenset(
        {OrderStatus.PAID, OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED}
    ),
    OrderStatus.PAID: frozenset({OrderStatus.CANCELLED}),
    OrderStatus.PAYMENT_FAILED: frozenset({OrderStatus.CANCELLED}),
    OrderStatus.CANCELLED: frozenset(),
}


def sources_of(target: OrderStatus) -> frozenset[OrderStatus]:
    """The statuses an order may move to `target` from; used by conditional updates."""
    return frozenset(s for s, targets in ALLOWED.items() if target in targets)


def ensure_transition(current: OrderStatus, target: OrderStatus) -> None:
    if target not in ALLOWED[current]:
        raise InvalidOrderTransitionError(f"an order cannot move from {current} to {target}")
