from typing import ClassVar

from app.shared.errors import DomainError, ErrorKind


class OrderNotFoundError(DomainError):
    code: ClassVar[str] = "order_not_found"
    kind: ClassVar[ErrorKind] = "not_found"
