from typing import ClassVar, Literal

from app.shared.errors import DomainError, ErrorKind


class PaymentRequestNotFoundError(DomainError):
    code: ClassVar[Literal["payment_request_not_found"]] = "payment_request_not_found"
    kind: ClassVar[ErrorKind] = "not_found"


class PaymentRequestConflictError(DomainError):
    """A conditional update was lost and the reloaded row disagrees with this outcome."""

    code: ClassVar[Literal["payment_request_conflict"]] = "payment_request_conflict"
    kind: ClassVar[ErrorKind] = "conflict"
