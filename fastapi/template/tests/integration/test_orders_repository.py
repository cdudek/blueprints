import uuid

import pytest
from sqlalchemy import text

from app.db.transaction import Tx
from app.modules.orders import (
    InvalidOrderTransitionError,
    OrderCreate,
    OrderNotFoundError,
    create_order,
    get_order,
    mark_paid,
    mark_payment_failed,
)
from app.shared.auth import Principal

pytestmark = pytest.mark.anyio

ALICE = Principal(subject="alice")
BOB = Principal(subject="bob")


async def test_create_then_read_own_order(tx: Tx) -> None:
    created = await create_order(tx, ALICE, OrderCreate(amount_cents=1200, currency="EUR"))

    assert created.status == "pending_payment"
    assert await get_order(tx, ALICE, created.id) == created


async def test_another_customers_order_reads_as_missing(tx: Tx) -> None:
    created = await create_order(tx, ALICE, OrderCreate(amount_cents=1200, currency="EUR"))

    with pytest.raises(OrderNotFoundError):
        await get_order(tx, BOB, created.id)


async def test_mark_paid_is_idempotent(tx: Tx) -> None:
    created = await create_order(tx, ALICE, OrderCreate(amount_cents=500, currency="USD"))

    await mark_paid(tx, created.id)
    await mark_paid(tx, created.id)

    assert (await get_order(tx, ALICE, created.id)).status == "paid"


async def test_a_paid_order_cannot_fail_payment(tx: Tx) -> None:
    created = await create_order(tx, ALICE, OrderCreate(amount_cents=500, currency="USD"))
    await mark_paid(tx, created.id)

    with pytest.raises(InvalidOrderTransitionError, match="from paid to payment_failed"):
        await mark_payment_failed(tx, created.id)


async def test_mark_paid_on_unknown_order_raises(tx: Tx) -> None:
    with pytest.raises(OrderNotFoundError):
        await mark_paid(tx, uuid.uuid4())


async def test_rolled_back_between_tests(tx: Tx) -> None:
    assert (await tx.execute(text("SELECT count(*) FROM orders"))).scalar_one() == 0
