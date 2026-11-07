"""A generic HTTP payments provider. Adapt the request and response mapping to yours."""

import httpx
from pydantic import SecretStr

from app.clients.payments.base import (
    ChargeResult,
    PaymentDeclinedError,
    PaymentOutcomeUnknownError,
    PaymentUnavailableError,
)


class RealPayments:
    def __init__(self, *, base_url: str, api_key: SecretStr, timeout: float = 10.0) -> None:
        self._base_url = base_url
        self._api_key = api_key
        self._timeout = timeout

    async def charge(
        self, *, amount_cents: int, currency: str, reference: str, idempotency_key: str
    ) -> ChargeResult:
        headers = {
            "Authorization": f"Bearer {self._api_key.get_secret_value()}",
            "Idempotency-Key": idempotency_key,
        }
        body = {"amount": amount_cents, "currency": currency, "reference": reference}
        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
                response = await client.post("/charges", json=body, headers=headers)
        except httpx.ConnectError as exc:
            raise PaymentUnavailableError("could not connect") from exc
        except httpx.HTTPError as exc:
            raise PaymentOutcomeUnknownError(type(exc).__name__) from exc
        if response.status_code == httpx.codes.PAYMENT_REQUIRED:
            raise PaymentDeclinedError(response.text[:200])
        if response.is_server_error or response.status_code == httpx.codes.TOO_MANY_REQUESTS:
            raise PaymentUnavailableError(f"provider answered {response.status_code}")
        response.raise_for_status()
        return ChargeResult(provider_reference=str(response.json()["id"]))
