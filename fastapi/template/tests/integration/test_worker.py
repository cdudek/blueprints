import uuid

import pytest
from procrastinate import App
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.clients.payments.providers.fixture import FixturePayments
from app.modules.billing.jobs import wake_stale_payment_requests
from app.modules.orders import OrderCreate, OrderOut
from app.shared.auth import Principal
from app.workflows.place_order import place_order
from tests.integration.conftest import run_worker
from tests.integration.slice import jobs_for, order_status, request_of, request_status

pytestmark = pytest.mark.anyio

ALICE = Principal(subject="alice")


async def place(amount_cents: int = 700) -> OrderOut:
    return await place_order(ALICE, OrderCreate(amount_cents=amount_cents, currency="EUR"))


async def test_placing_an_order_defers_one_job_in_the_same_transaction(
    bound_db: AsyncEngine,
) -> None:
    order = await place()

    assert await jobs_for(bound_db, await request_of(bound_db, order.id)) == 1


async def test_the_worker_charges_once_and_marks_the_order_paid(
    jobs: App, bound_db: AsyncEngine, payments: FixturePayments
) -> None:
    order = await place()
    request_id = await request_of(bound_db, order.id)

    await run_worker(jobs)

    assert payments.charged_references.count(str(request_id)) == 1
    assert await request_status(bound_db, request_id) == "succeeded"
    assert await order_status(bound_db, order.id) == "paid"


async def test_the_sweeper_wakes_a_request_whose_job_is_gone(
    jobs: App, bound_db: AsyncEngine, payments: FixturePayments
) -> None:
    order = await place()
    request_id = await request_of(bound_db, order.id)
    async with bound_db.begin() as conn:
        await conn.execute(
            text("DELETE FROM procrastinate_jobs WHERE args->>'request_id' = :id"),
            {"id": str(request_id)},
        )
        await conn.execute(
            text(
                "UPDATE payment_requests SET created_at = now() - interval '1 hour' WHERE id = :id"
            ),
            {"id": request_id},
        )

    await wake_stale_payment_requests(timestamp=0)  # what the periodic run does each minute
    await run_worker(jobs)

    assert payments.charged_references.count(str(request_id)) == 1
    assert await order_status(bound_db, order.id) == "paid"


async def test_jobs_for_unknown_request_is_zero(bound_db: AsyncEngine) -> None:
    assert await jobs_for(bound_db, uuid.uuid4()) == 0
