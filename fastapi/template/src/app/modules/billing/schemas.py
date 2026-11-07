import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

type PaymentRequestStatusName = Literal[
    "requested", "processing", "succeeded", "failed", "needs_attention"
]


class PaymentRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    amount_cents: int
    currency: str
    status: PaymentRequestStatusName
    attempts: int
    provider_reference: str | None


class ClaimedPaymentRequest(BaseModel):
    """What a worker needs to call the provider, read inside the claiming transaction."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    amount_cents: int
    currency: str
    idempotency_key: str
    attempts: int
