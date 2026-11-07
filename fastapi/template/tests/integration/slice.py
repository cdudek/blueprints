"""Read-backs for the worked slice, each on its own connection: only committed data counts."""

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

PROCESS = "billing.process_payment_request"


async def _scalar(engine: AsyncEngine, sql: str, **params: object) -> object:
    async with engine.connect() as conn:
        return await conn.scalar(text(sql), params)


async def request_of(engine: AsyncEngine, order_id: uuid.UUID) -> uuid.UUID:
    value = await _scalar(
        engine, "SELECT id FROM payment_requests WHERE order_id = :id", id=order_id
    )
    assert isinstance(value, uuid.UUID)
    return value


async def request_status(engine: AsyncEngine, request_id: uuid.UUID) -> str:
    value = await _scalar(
        engine, "SELECT status::text FROM payment_requests WHERE id = :id", id=request_id
    )
    assert isinstance(value, str)
    return value


async def order_status(engine: AsyncEngine, order_id: uuid.UUID) -> str:
    value = await _scalar(engine, "SELECT status::text FROM orders WHERE id = :id", id=order_id)
    assert isinstance(value, str)
    return value


async def jobs_for(engine: AsyncEngine, request_id: uuid.UUID) -> int:
    value = await _scalar(
        engine,
        "SELECT count(*) FROM procrastinate_jobs"
        " WHERE task_name = :task AND args->>'request_id' = :id",
        task=PROCESS,
        id=str(request_id),
    )
    assert isinstance(value, int)
    return value
