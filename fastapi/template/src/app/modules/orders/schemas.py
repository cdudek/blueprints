"""What crosses the orders door."""

import enum
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, PositiveInt


class OrderStatus(enum.StrEnum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    PAYMENT_FAILED = "payment_failed"
    CANCELLED = "cancelled"


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_cents: PositiveInt
    currency: Literal["EUR", "USD"]


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: str
    amount_cents: int
    currency: str
    status: OrderStatus
