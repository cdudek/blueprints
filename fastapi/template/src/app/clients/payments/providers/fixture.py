"""In-memory payments with real idempotency-key semantics: the oracle of the slice tests.

`script` queues outcomes for new keys ("succeed", "decline", "unavailable", "unknown_after_send").
`raise_after_charge` simulates a worker dying right after the provider charged.
"""

from typing import Literal

from app.clients.payments.base import (
    ChargeResult,
    PaymentDeclinedError,
    PaymentOutcomeUnknownError,
    PaymentUnavailableError,
)

type Outcome = Literal["succeed", "decline", "unavailable", "unknown_after_send"]


class FaultInjectedError(Exception):
    pass


class FixturePayments:
    def __init__(self) -> None:
        self.charges: dict[str, ChargeResult] = {}
        self.calls = 0
        self.script: list[Outcome] = []
        self.raise_after_charge = False

    async def charge(
        self, *, amount_cents: int, currency: str, reference: str, idempotency_key: str
    ) -> ChargeResult:
        self.calls += 1
        result = self.charges.get(idempotency_key)
        if result is None:
            outcome = self.script.pop(0) if self.script else "succeed"
            if outcome == "decline":
                raise PaymentDeclinedError(f"declined {reference}")
            if outcome == "unavailable":
                raise PaymentUnavailableError("provider unavailable")
            result = ChargeResult(provider_reference=f"fx_{len(self.charges) + 1}")
            self.charges[idempotency_key] = result
            if outcome == "unknown_after_send":
                raise PaymentOutcomeUnknownError("timeout after send")
        if self.raise_after_charge:
            self.raise_after_charge = False
            raise FaultInjectedError("worker died after the charge")
        return result
