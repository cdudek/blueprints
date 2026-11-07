"""Pure decisions about payment requests."""

from app.modules.billing.models import PaymentRequestStatus

MAX_ATTEMPTS = 5


def after_retryable_failure(
    attempts: int, max_attempts: int = MAX_ATTEMPTS
) -> PaymentRequestStatus:
    """Transient error or unknown outcome: retry with the same key, until the attempts run out."""
    if attempts >= max_attempts:
        return PaymentRequestStatus.NEEDS_ATTENTION
    return PaymentRequestStatus.REQUESTED
