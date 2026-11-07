"""Private to billing. A payment request row is the durable intent to charge once."""

import secrets
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.billing.schemas import PaymentRequestStatus


def _new_idempotency_key() -> str:
    return secrets.token_urlsafe(24)


class PaymentRequest(Base):
    __tablename__ = "payment_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # A foreign key by table name only: no relationship() across modules.
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    amount_cents: Mapped[int]
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[PaymentRequestStatus] = mapped_column(
        Enum(
            PaymentRequestStatus,
            name="payment_request_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        index=True,
    )
    # Generated once with the row and never changed: every retry sends the same key.
    idempotency_key: Mapped[str] = mapped_column(
        String(64), unique=True, default=_new_idempotency_key
    )
    attempts: Mapped[int] = mapped_column(default=0)
    provider_reference: Mapped[str | None] = mapped_column(String(255))
    last_error: Mapped[str | None] = mapped_column(String(500))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
