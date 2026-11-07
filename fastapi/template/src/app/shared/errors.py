"""Expected failures are exceptions with a closed code. `api/` maps them to problem details."""

from typing import ClassVar, Literal

type ErrorKind = Literal["not_found", "conflict", "invalid", "forbidden"]


class DomainError(Exception):
    """Subclasses set `code` (a Literal, unique across modules) and `kind` (the HTTP family)."""

    code: ClassVar[str]
    kind: ClassVar[ErrorKind]

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail
