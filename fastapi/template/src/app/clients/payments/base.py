"""The payments port.

Contract: `charge` must be idempotent per `idempotency_key`. A repeated key returns the first
result and never charges twice. A provider without idempotency keys must look up a charge by our
`reference` before charging; adapt it in its provider file, never in the caller.
"""

from typing import Protocol

from pydantic import BaseModel


class ChargeResult(BaseModel, frozen=True):
    provider_reference: str


class PaymentDeclinedError(Exception):
    """A definite no. Never retried."""


class PaymentUnavailableError(Exception):
    """Transient: nothing was charged. Retry with the same key."""


class PaymentOutcomeUnknownError(Exception):
    """The request may have reached the provider (for example a timeout after sending).
    Retry with the same key; the provider's idempotency resolves it."""


class Payments(Protocol):
    async def charge(
        self, *, amount_cents: int, currency: str, reference: str, idempotency_key: str
    ) -> ChargeResult: ...
