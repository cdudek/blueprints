import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.transaction import Tx
from app.modules import billing
from app.modules.orders import OrderCreate
from app.shared.auth import Principal
from app.workflows.place_order import place_order

pytestmark = pytest.mark.anyio

ALICE = Principal(subject="alice")


async def count_rows(engine: AsyncEngine, order_id: uuid.UUID) -> tuple[int, int]:
    """Counted on a separate connection: only committed data is visible."""
    async with engine.connect() as conn:
        orders = await conn.scalar(
            text("SELECT count(*) FROM orders WHERE id = :id"), {"id": order_id}
        )
        requests = await conn.scalar(
            text("SELECT count(*) FROM payment_requests WHERE order_id = :id"), {"id": order_id}
        )
    return orders or 0, requests or 0


async def test_order_and_payment_request_commit_together(bound_db: AsyncEngine) -> None:
    order = await place_order(ALICE, OrderCreate(amount_cents=2500, currency="EUR"))

    assert order.status == "pending_payment"
    assert await count_rows(bound_db, order.id) == (1, 1)


async def test_a_failing_payment_request_rolls_back_the_order(
    bound_db: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    created: list[uuid.UUID] = []
    real_request_payment = billing.request_payment

    async def write_then_fail(
        tx: Tx, order_id: uuid.UUID, amount_cents: int, currency: str
    ) -> billing.PaymentRequestOut:
        result = await real_request_payment(tx, order_id, amount_cents, currency)
        created.append(result.order_id)
        raise RuntimeError("billing failed after writing")

    monkeypatch.setattr(billing, "request_payment", write_then_fail)

    with pytest.raises(RuntimeError, match="billing failed after writing"):
        await place_order(ALICE, OrderCreate(amount_cents=2500, currency="EUR"))

    assert created, "both writes happened before the failure"
    assert await count_rows(bound_db, created[0]) == (0, 0)
