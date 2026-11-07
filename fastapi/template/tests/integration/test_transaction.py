import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.transaction import TransactionAlreadyOpenError, in_transaction

pytestmark = pytest.mark.anyio


async def test_nested_in_transaction_raises(bound_db: AsyncEngine) -> None:
    async with in_transaction():
        with pytest.raises(TransactionAlreadyOpenError, match="pass `tx` down instead"):
            async with in_transaction():
                pass


async def test_leaving_the_block_commits_and_an_error_rolls_back(bound_db: AsyncEngine) -> None:
    async with in_transaction() as tx:
        await tx.execute(text("CREATE TABLE probe (n int)"))
        await tx.execute(text("INSERT INTO probe VALUES (1)"))

    async def insert_then_fail() -> None:
        async with in_transaction() as tx:
            await tx.execute(text("INSERT INTO probe VALUES (2)"))
            raise RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        await insert_then_fail()

    async with bound_db.connect() as conn:
        assert (await conn.execute(text("SELECT array_agg(n) FROM probe"))).scalar_one() == [1]


async def test_schema_history_records_the_applied_revision(bound_db: AsyncEngine) -> None:
    async with bound_db.connect() as conn:
        revisions = (await conn.execute(text("SELECT revision FROM schema_history"))).scalars()
        assert len(list(revisions)) == 1
