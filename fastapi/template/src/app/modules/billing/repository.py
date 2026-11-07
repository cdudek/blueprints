"""Queries for payment requests. Private to billing; takes `tx` and never commits."""

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select, update

from app.db.transaction import Tx
from app.modules.billing.models import PaymentRequest, PaymentRequestStatus

Status = PaymentRequestStatus


async def add(tx: Tx, request: PaymentRequest) -> PaymentRequest:
    tx.add(request)
    await tx.flush()
    return request


async def get(tx: Tx, request_id: uuid.UUID) -> PaymentRequest | None:
    return await tx.get(PaymentRequest, request_id, populate_existing=True)


async def claim(tx: Tx, request_id: uuid.UUID, stale_after: timedelta) -> PaymentRequest | None:
    """`requested`, or `processing` claimed longer ago than `stale_after`, becomes `processing`."""
    stale = and_(
        PaymentRequest.status == Status.PROCESSING,
        PaymentRequest.claimed_at < func.now() - stale_after,
    )
    result = await tx.execute(
        update(PaymentRequest)
        .where(
            PaymentRequest.id == request_id,
            or_(PaymentRequest.status == Status.REQUESTED, stale),
        )
        .values(
            status=Status.PROCESSING,
            attempts=PaymentRequest.attempts + 1,
            claimed_at=func.now(),
        )
        .returning(PaymentRequest)
    )
    return result.scalar_one_or_none()


async def move_if(
    tx: Tx, request_id: uuid.UUID, from_status: Status, to: Status, **values: Any
) -> bool:
    result = await tx.execute(
        update(PaymentRequest)
        .where(PaymentRequest.id == request_id, PaymentRequest.status == from_status)
        .values(status=to, **values)
        .returning(PaymentRequest.id)
    )
    return result.scalar_one_or_none() is not None


async def requested_before(tx: Tx, older_than: timedelta) -> Sequence[uuid.UUID]:
    result = await tx.scalars(
        select(PaymentRequest.id).where(
            PaymentRequest.status == Status.REQUESTED,
            PaymentRequest.created_at < func.now() - older_than,
        )
    )
    return result.all()
