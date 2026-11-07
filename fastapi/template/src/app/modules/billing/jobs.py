"""Billing's worker tasks. Run by `app.worker`; each task owns its transactions.

`process_payment_request` follows the worked slice: transaction 1 claims the row and commits; the
charge runs outside any transaction with the row's fixed idempotency key; transaction 2 records
the outcome. A crash anywhere leaves a state the next attempt resumes from.
"""

import uuid
from datetime import timedelta

from procrastinate import RetryStrategy

from app.clients.payments import (
    PaymentDeclinedError,
    PaymentOutcomeUnknownError,
    Payments,
    PaymentUnavailableError,
    get_payments,
)
from app.db.queue import STALLED_AFTER_SECONDS, defer_in, queue
from app.db.transaction import Tx, in_transaction
from app.modules.billing import system
from app.modules.billing.models import PaymentRequestStatus
from app.modules.billing.rules import MAX_ATTEMPTS

# A `processing` claim older than this belongs to a dead worker: the worker's stalled timeout.
STALE_AFTER = timedelta(seconds=STALLED_AFTER_SECONDS)


class RetryLaterError(Exception):
    """Raised to let the queue retry with backoff; the row is back in `requested`."""


@queue.task(
    name="billing.process_payment_request",
    retry=RetryStrategy(
        max_attempts=MAX_ATTEMPTS, exponential_wait=4, retry_exceptions={RetryLaterError}
    ),
)
async def process_payment_request(request_id: str) -> None:
    await run_payment_request(uuid.UUID(request_id), get_payments())


async def run_payment_request(
    request_id: uuid.UUID, payments: Payments, stale_after: timedelta = STALE_AFTER
) -> None:
    async with in_transaction() as tx:
        claimed = await system.claim(tx, request_id, stale_after)
    if claimed is None:
        return  # another worker holds it, or it is finished
    try:
        result = await payments.charge(
            amount_cents=claimed.amount_cents,
            currency=claimed.currency,
            reference=str(claimed.id),
            idempotency_key=claimed.idempotency_key,
        )
    except PaymentDeclinedError as exc:
        async with in_transaction() as tx:
            await system.record_decline(tx, claimed.id, str(exc))
        return
    except (PaymentUnavailableError, PaymentOutcomeUnknownError) as exc:
        async with in_transaction() as tx:
            status = await system.record_retryable_failure(
                tx, claimed.id, f"{type(exc).__name__}: {exc}"
            )
        if status is PaymentRequestStatus.REQUESTED:
            raise RetryLaterError(str(claimed.id)) from exc
        return
    async with in_transaction() as tx:
        await system.record_success(tx, claimed.id, result.provider_reference)


async def wake(tx: Tx, request_id: uuid.UUID) -> bool:
    """Defers the job in the caller's transaction; False if one is already waiting."""
    return await defer_in(
        tx, process_payment_request, queueing_lock=str(request_id), request_id=str(request_id)
    )


@queue.periodic(cron="* * * * *")
@queue.task(name="billing.wake_stale_payment_requests", queueing_lock="billing.wake_stale")
async def wake_stale_payment_requests(timestamp: int) -> None:
    """The safety net: a request whose job failed for good or vanished gets a new one."""
    async with in_transaction() as tx:
        for request_id in await system.requests_to_wake(tx, STALE_AFTER):
            await wake(tx, request_id)
