"""One owner per transaction: the entry point opens it with `in_transaction()`, passes `tx` down.

Operations and repositories take `tx: Tx` and never open, commit or roll back. Leaving the
`async with` block commits; an exception rolls back. Opening a second one inside the first raises,
so there is no hidden nesting.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import NewType

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

Tx = NewType("Tx", AsyncSession)

# A plain global, not a ContextVar: the lifespan task's context is not inherited by requests.
_sessionmaker: list[async_sessionmaker[AsyncSession]] = []
_open: ContextVar[bool] = ContextVar("transaction_open", default=False)


class TransactionAlreadyOpenError(RuntimeError):
    pass


def bind_engine(engine: AsyncEngine) -> None:
    """Called once per process (lifespan, worker startup, test fixture)."""
    _sessionmaker[:] = [async_sessionmaker(engine, expire_on_commit=False)]


@asynccontextmanager
async def in_transaction() -> AsyncIterator[Tx]:
    if _open.get():
        raise TransactionAlreadyOpenError(
            "in_transaction() called inside an open transaction; pass `tx` down instead"
        )
    if not _sessionmaker:
        raise RuntimeError("no engine bound; call bind_engine() at process startup")
    token = _open.set(True)
    try:
        async with _sessionmaker[0]() as session, session.begin():
            yield Tx(session)
    finally:
        _open.reset(token)
