from functools import cache

from app.clients.payments.base import Payments
from app.clients.payments.providers.fixture import FixturePayments
from app.clients.payments.providers.noop import NoopPayments
from app.clients.payments.providers.real import RealPayments
from app.config.settings import Settings, get_settings


def create_payments(settings: Settings) -> Payments:
    match settings.payments_provider:
        case "fixture":
            return FixturePayments()
        case "noop":
            return NoopPayments()
        case "real":
            if settings.payments_api_key is None:
                raise RuntimeError("PAYMENTS_API_KEY is required for the real payments provider")
            return RealPayments(
                base_url=settings.payments_base_url, api_key=settings.payments_api_key
            )


@cache
def get_payments() -> Payments:
    """One provider per process. Tests read the fixture instance back as their oracle."""
    return create_payments(get_settings())
