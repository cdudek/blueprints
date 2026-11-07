"""Payments switched off: every charge succeeds without contacting anyone."""

from app.clients.payments.base import ChargeResult


class NoopPayments:
    async def charge(
        self, *, amount_cents: int, currency: str, reference: str, idempotency_key: str
    ) -> ChargeResult:
        return ChargeResult(provider_reference=f"noop_{reference}")
