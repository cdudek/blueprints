"""System operations for billing's jobs and webhooks. Never imported by a user route.

Each runs inside a transaction its caller owns. The charge itself happens between them, outside
any transaction (see jobs.py).
"""

import logging
import uuid
from collections.abc import Sequence
from datetime import timedelta

from app.db.transaction import Tx
from app.modules import orders
from app.modules.billing import repository, rules
from app.modules.billing.errors import PaymentRequestConflictError, PaymentRequestNotFoundError
from app.modules.billing.models import PaymentRequest, PaymentRequestStatus
from app.modules.billing.schemas import ClaimedPaymentRequest
from app.shared.access import operation

Status = PaymentRequestStatus
log = logging.getLogger(__name__)


@operation(access="system")
async def claim(
    tx: Tx, request_id: uuid.UUID, stale_after: timedelta
) -> ClaimedPaymentRequest | None:
    """None means another worker holds it, or it is finished: stop."""
    row = await repository.claim(tx, request_id, stale_after)
    return None if row is None else ClaimedPaymentRequest.model_validate(row)


async def _reload(tx: Tx, request_id: uuid.UUID) -> PaymentRequest:
    row = await repository.get(tx, request_id)
    if row is None:
        raise PaymentRequestNotFoundError(f"payment request {request_id} not found")
    return row


@operation(access="system")
async def record_success(tx: Tx, request_id: uuid.UUID, provider_reference: str) -> None:
    moved = await repository.move_if(
        tx, request_id, Status.PROCESSING, Status.SUCCEEDED, provider_reference=provider_reference
    )
    row = await _reload(tx, request_id)
    if not moved and not (
        row.status is Status.SUCCEEDED and row.provider_reference == provider_reference
    ):
        raise PaymentRequestConflictError(
            f"payment request {request_id} is {row.status}, cannot record success"
        )
    await orders.mark_paid(tx, row.order_id)


@operation(access="system")
async def record_decline(tx: Tx, request_id: uuid.UUID, reason: str) -> None:
    moved = await repository.move_if(
        tx, request_id, Status.PROCESSING, Status.FAILED, last_error=reason[:500]
    )
    row = await _reload(tx, request_id)
    if not moved and row.status is not Status.FAILED:
        raise PaymentRequestConflictError(
            f"payment request {request_id} is {row.status}, cannot record a decline"
        )
    await orders.mark_payment_failed(tx, row.order_id)


@operation(access="system")
async def record_retryable_failure(tx: Tx, request_id: uuid.UUID, error: str) -> Status:
    """Back to `requested` for a retry with the same key, or `needs_attention` when exhausted."""
    row = await _reload(tx, request_id)
    if row.status is not Status.PROCESSING:
        raise PaymentRequestConflictError(
            f"payment request {request_id} is {row.status}, cannot record a failure"
        )
    target = rules.after_retryable_failure(row.attempts)
    if not await repository.move_if(
        tx, request_id, Status.PROCESSING, target, last_error=error[:500]
    ):
        raise PaymentRequestConflictError(f"payment request {request_id} changed under us")
    if target is Status.NEEDS_ATTENTION:
        log.critical(
            "payment request needs attention",
            extra={"payment_request_id": str(request_id), "attempts": row.attempts},
        )
    return target


@operation(access="system")
async def requests_to_wake(tx: Tx, older_than: timedelta) -> Sequence[uuid.UUID]:
    """Unfinished requests whose job may be gone: failed for good, or never retried."""
    return await repository.unfinished_before(tx, older_than)
