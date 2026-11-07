from typing import ClassVar, Literal

from app.shared.errors import DomainError, ErrorKind


class OrderNotFoundError(DomainError):
    code: ClassVar[Literal["order_not_found"]] = "order_not_found"
    kind: ClassVar[ErrorKind] = "not_found"


class InvalidOrderTransitionError(DomainError):
    code: ClassVar[Literal["invalid_order_transition"]] = "invalid_order_transition"
    kind: ClassVar[ErrorKind] = "conflict"
