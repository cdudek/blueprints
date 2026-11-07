import pytest

from app.modules.orders.errors import InvalidOrderTransitionError
from app.modules.orders.rules import ensure_transition, sources_of
from app.modules.orders.schemas import OrderStatus


def test_only_a_pending_order_can_be_paid() -> None:
    assert sources_of(OrderStatus.PAID) == {OrderStatus.PENDING_PAYMENT}


def test_a_cancelled_order_is_final() -> None:
    with pytest.raises(InvalidOrderTransitionError, match="from cancelled to paid"):
        ensure_transition(OrderStatus.CANCELLED, OrderStatus.PAID)
