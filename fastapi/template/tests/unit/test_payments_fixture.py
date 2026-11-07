import pytest

from app.clients.payments import (
    PaymentDeclinedError,
    PaymentOutcomeUnknownError,
    PaymentUnavailableError,
)
from app.clients.payments.providers.fixture import FaultInjectedError, FixturePayments, Outcome

pytestmark = pytest.mark.anyio


async def charge(payments: FixturePayments, key: str = "k1") -> str:
    result = await payments.charge(
        amount_cents=100, currency="EUR", reference="r1", idempotency_key=key
    )
    return result.provider_reference


async def test_a_repeated_key_returns_the_first_result_and_charges_once() -> None:
    payments = FixturePayments()

    assert await charge(payments) == await charge(payments)
    assert len(payments.charges) == 1


async def test_unknown_outcome_has_charged_and_the_retry_returns_that_charge() -> None:
    payments = FixturePayments()
    payments.script = ["unknown_after_send"]

    with pytest.raises(PaymentOutcomeUnknownError):
        await charge(payments)

    assert await charge(payments) == "fx_1"
    assert len(payments.charges) == 1


async def test_raise_after_charge_charges_then_fails_once() -> None:
    payments = FixturePayments()
    payments.raise_after_charge = True

    with pytest.raises(FaultInjectedError):
        await charge(payments)

    assert await charge(payments) == "fx_1"


@pytest.mark.parametrize(
    ("outcome", "error"),
    [("decline", PaymentDeclinedError), ("unavailable", PaymentUnavailableError)],
)
async def test_failures_charge_nothing(outcome: Outcome, error: type[Exception]) -> None:
    payments = FixturePayments()
    payments.script = [outcome]

    with pytest.raises(error):
        await charge(payments)

    assert payments.charges == {}
