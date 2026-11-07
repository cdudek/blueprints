"""Alembic, async, on the app's own engine factory.

Every applied revision is recorded in `schema_history` (see app/db/schema_history.py), so
readiness can ask "is the revision my code needs applied?" instead of "is this the exact head?".
"""

import asyncio
from logging.config import fileConfig
from typing import Any

from alembic import context
from alembic.runtime.migration import MigrationContext, MigrationInfo
from sqlalchemy import delete, inspect
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection

from app.config.settings import get_settings
from app.db.engine import create_engine
from app.db.schema_history import schema_history
from app.schema import metadata

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)


def record_revision(ctx: MigrationContext, step: MigrationInfo, **_kw: Any) -> None:
    conn = ctx.connection
    if conn is None:
        raise RuntimeError("schema_history needs an online migration")
    revision = step.up_revision_id
    if step.is_upgrade:
        conn.execute(insert(schema_history).values(revision=revision).on_conflict_do_nothing())
    elif inspect(conn).has_table(schema_history.name):  # the first revision drops the table
        conn.execute(delete(schema_history).where(schema_history.c.revision == revision))


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=metadata,
        on_version_apply=record_revision,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Tests pass the URL of their own database; everything else uses the settings.
    url = config.attributes.get("database_url") or get_settings().database_url
    engine = create_engine(url)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    raise SystemExit("offline migrations are not supported: run against a database")
asyncio.run(run_async_migrations())
