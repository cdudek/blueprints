"""Every applied migration revision, written by Alembic's `on_version_apply` hook in env.py.

Readiness asks whether the revision the code needs has been applied, not whether the database is
at the exact head, so old instances stay ready after an expand migration.
"""

from sqlalchemy import Column, DateTime, String, Table, func, select

from app.db.base import Base
from app.db.transaction import Tx

# The newest migration this code needs. Raise it in the change that starts using a new revision;
# never lower it. Old instances keep their older value and stay ready after an expand migration.
REQUIRED_REVISION = "7807d1c8a26c"

schema_history = Table(
    "schema_history",
    Base.metadata,
    Column("revision", String(64), primary_key=True),
    Column("applied_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)


async def is_applied(tx: Tx, revision: str) -> bool:
    found = await tx.scalar(
        select(schema_history.c.revision).where(schema_history.c.revision == revision)
    )
    return found is not None
