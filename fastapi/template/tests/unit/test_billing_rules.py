from app.modules.billing.rules import MAX_ATTEMPTS, after_retryable_failure
from app.modules.billing.schemas import PaymentRequestStatus


def test_retry_until_the_attempts_run_out() -> None:
    assert after_retryable_failure(1) is PaymentRequestStatus.REQUESTED
    assert after_retryable_failure(MAX_ATTEMPTS - 1) is PaymentRequestStatus.REQUESTED
    assert after_retryable_failure(MAX_ATTEMPTS) is PaymentRequestStatus.NEEDS_ATTENTION
