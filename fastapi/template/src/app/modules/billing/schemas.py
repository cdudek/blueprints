import enum
import uuid

from pydantic import BaseModel, ConfigDict


class PaymentRequestStatus(enum.StrEnum):
    REQUESTED = "requested"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    NEEDS_ATTENTION = "needs_attention"


class PaymentRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    amount_cents: int
    currency: str
    status: PaymentRequestStatus
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
