"""The job queue: Procrastinate on the app database.

Modules register tasks on `queue` in their `jobs.py`; `app.worker` runs them. Every deferral goes
through `defer_in`, on the caller's transaction: a job commits or rolls back with its data.
"""

from typing import Any

from procrastinate import App, JobContext, PsycopgConnector
from procrastinate.exceptions import AlreadyEnqueued
from procrastinate.middleware import AsyncCallNext
from procrastinate.tasks import Task
from procrastinate.worker import Worker
from psycopg_pool import AsyncConnectionPool
from sqlalchemy.engine import make_url

from app.config.settings import get_settings
from app.db.engine import create_engine
from app.db.transaction import Tx, bind_engine, is_bound

HEARTBEAT_SECONDS = 10
STALLED_AFTER_SECONDS = 30


def conninfo(url: str) -> str:
    """The SQLAlchemy URL as a libpq connection string."""
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


async def _bind_database(call_next: AsyncCallNext, _ctx: JobContext, _worker: Worker) -> Any:
    if not is_bound():
        bind_engine(create_engine(get_settings().database_url))
    return await call_next()


def _pool(**kwargs: Any) -> AsyncConnectionPool:
    """Built when the worker opens the app, from the settings at that moment."""
    return AsyncConnectionPool(conninfo(get_settings().database_url), **kwargs)


queue = App(
    connector=PsycopgConnector(pool_factory=_pool),
    worker_defaults={
        "update_heartbeat_interval": HEARTBEAT_SECONDS,
        "stalled_worker_timeout": STALLED_AFTER_SECONDS,
        "worker_middleware": [_bind_database],
    },
)


async def defer_in(tx: Tx, task: Task[..., Any, Any], *, queueing_lock: str, **kwargs: Any) -> bool:
    """False when a job with this `queueing_lock` is already waiting; the transaction goes on."""
    connection = await (await tx.connection()).get_raw_connection()
    try:
        async with tx.begin_nested():  # a duplicate aborts only this savepoint
            await task.configure(
                connection=connection.driver_connection, queueing_lock=queueing_lock
            ).defer_async(**kwargs)
    except AlreadyEnqueued:
        return False
    return True
