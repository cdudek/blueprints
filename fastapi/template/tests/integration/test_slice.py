"""The worked slice (docs/worked-slice.md): real Postgres, real commits, separate connections.

The fixture provider keeps idempotency-key semantics, so `charged_references` is the oracle for
"exactly one charge per payment request".
"""

import asyncio
import logging
import uuid

import pytest
from procrastinate import App, JobContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.clients.payments import ChargeResult, Payments
from app.clients.payments.providers.fixture import FaultInjectedError, FixturePayments
from app.db.transaction import Tx
from app.modules.billing import system
from app.modules.billing.jobs import STALE_AFTER, RetryLaterError, run_payment_request
from app.modules.billing.rules import MAX_ATTEMPTS
from app.modules.orders import OrderCreate
from app.shared.auth import Principal
from app.worker import retry_stalled_jobs
from app.workflows.place_order import place_order
from tests.integration.conftest import run_worker
from tests.integration.slice import order_status, request_of, request_status

pytestmark = pytest.mark.anyio

ALICE = Principal(subject="alice")


async def placed_request(engine: AsyncEngine) -> tuple[uuid.UUID, uuid.UUID]:
    order = await place_order(ALICE, OrderCreate(amount_cents=4200, currency="EUR"))
    return order.id, await request_of(engine, order.id)


async def attempts_of(engine: AsyncEngine, request_id: uuid.UUID) -> int:
    async with engine.connect() as conn:
        value = await conn.scalar(
            text("SELECT attempts FROM payment_requests WHERE id = :id"), {"id": request_id}
        )
    assert isinstance(value, int)
    return value


async def test_payment_succeeded_but_the_worker_died_before_recording_it(
    jobs: App, bound_db: AsyncEngine, payments: FixturePayments
) -> None:
    order_id, request_id = await placed_request(bound_db)

    # A worker takes the job, charges, and dies before recording anything: its job stays
    # `doing` and it stops heartbeating.
    dead_worker = await jobs.job_manager.register_worker()
    job = await jobs.job_manager.fetch_job(queues=None, worker_id=dead_worker)
    assert job is not None
    assert job.task_kwargs == {"request_id": str(request_id)}
    payments.raise_after_charge = True
    with pytest.raises(FaultInjectedError):
        await run_payment_request(request_id, payments)
    async with bound_db.begin() as conn:  # time passes: no heartbeat, the claim goes stale
        await conn.execute(
            text("UPDATE procrastinate_workers SET last_heartbeat = now() - interval '1 hour'")
        )
        await conn.execute(
            text("UPDATE payment_requests SET claimed_at = claimed_at - :age WHERE id = :id"),
            {"age": STALE_AFTER * 2, "id": request_id},
        )
    assert await request_status(bound_db, request_id) == "processing"

    # The periodic stalled-job retry puts the job back; a live worker runs it again.
    context = JobContext(app=jobs, job=job, start_timestamp=0.0, abort_reason=lambda: None)
    await retry_stalled_jobs(context, timestamp=0)
    await run_worker(jobs)

    assert payments.charged_references.count(str(request_id)) == 1
    assert payments.calls == 2  # the second call got the first charge back by its key
    assert await request_status(bound_db, request_id) == "succeeded"
    assert await order_status(bound_db, order_id) == "paid"


async def test_two_claims_on_two_connections_one_wins(bound_db: AsyncEngine) -> None:
    _, request_id = await placed_request(bound_db)

    async with bound_db.connect() as first, bound_db.connect() as second:
        await first.begin()
        await second.begin()
        winner = await system.claim(Tx(AsyncSession(bind=first)), request_id, STALE_AFTER)
        # The second claim blocks on the row lock until the first commits, then re-reads the row.
        loser = asyncio.create_task(
            system.claim(Tx(AsyncSession(bind=second)), request_id, STALE_AFTER)
        )
        await asyncio.sleep(0.2)
        assert not loser.done(), "the second claim waits for the first transaction"
        await first.commit()
        assert winner is not None
        assert await loser is None
        await second.commit()

    assert await attempts_of(bound_db, request_id) == 1


class SlowPayments:
    """Holds every charge open long enough for a second worker to try the same request."""

    def __init__(self, inner: FixturePayments) -> None:
        self.inner = inner

    async def charge(
        self, *, amount_cents: int, currency: str, reference: str, idempotency_key: str
    ) -> ChargeResult:
        await asyncio.sleep(0.2)
        return await self.inner.charge(
            amount_cents=amount_cents,
            currency=currency,
            reference=reference,
            idempotency_key=idempotency_key,
        )


async def test_two_workers_race_for_one_request(
    bound_db: AsyncEngine, payments: FixturePayments
) -> None:
    order_id, request_id = await placed_request(bound_db)
    slow: Payments = SlowPayments(payments)

    await asyncio.gather(
        run_payment_request(request_id, slow), run_payment_request(request_id, slow)
    )

    assert payments.calls == 1, "only the worker that claimed it called the provider"
    assert payments.charged_references.count(str(request_id)) == 1
    assert await attempts_of(bound_db, request_id) == 1
    assert await order_status(bound_db, order_id) == "paid"


async def test_a_decline_fails_the_order_without_retry(
    bound_db: AsyncEngine, payments: FixturePayments
) -> None:
    order_id, request_id = await placed_request(bound_db)
    payments.script = ["decline"]

    await run_payment_request(request_id, payments)  # returns: nothing for the queue to retry

    assert payments.charged_references == []
    assert await request_status(bound_db, request_id) == "failed"
    assert await order_status(bound_db, order_id) == "payment_failed"


async def test_unknown_outcome_then_success_charges_once(
    bound_db: AsyncEngine, payments: FixturePayments
) -> None:
    order_id, request_id = await placed_request(bound_db)
    payments.script = ["unknown_after_send"]

    with pytest.raises(RetryLaterError):
        await run_payment_request(request_id, payments)
    assert await request_status(bound_db, request_id) == "requested"
    await run_payment_request(request_id, payments)

    assert payments.calls == 2
    assert payments.charged_references.count(str(request_id)) == 1
    assert await request_status(bound_db, request_id) == "succeeded"
    assert await order_status(bound_db, order_id) == "paid"


async def test_maximum_attempts_reach_needs_attention(
    bound_db: AsyncEngine, payments: FixturePayments, caplog: pytest.LogCaptureFixture
) -> None:
    order_id, request_id = await placed_request(bound_db)
    payments.script = ["unavailable"] * MAX_ATTEMPTS

    for _ in range(MAX_ATTEMPTS - 1):
        with pytest.raises(RetryLaterError):
            await run_payment_request(request_id, payments)
    with caplog.at_level(logging.CRITICAL):
        await run_payment_request(request_id, payments)  # the last attempt stops retrying

    assert await request_status(bound_db, request_id) == "needs_attention"
    assert await attempts_of(bound_db, request_id) == MAX_ATTEMPTS
    assert await order_status(bound_db, order_id) == "pending_payment"
    assert payments.charged_references == []
    assert [r.message for r in caplog.records if r.levelno == logging.CRITICAL] == [
        "payment request needs attention"
    ]
    await run_payment_request(request_id, payments)  # a later wake-up changes nothing
    assert payments.calls == MAX_ATTEMPTS
