"""Every applied migration revision, written by Alembic's `on_version_apply` hook in env.py.

Readiness asks whether the revision the code needs has been applied, not whether the database is
at the exact head, so old instances stay ready after an expand migration.
"""

from sqlalchemy import Column, DateTime, String, Table, func

from app.db.base import Base

schema_history = Table(
    "schema_history",
    Base.metadata,
    Column("revision", String(64), primary_key=True),
    Column("applied_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)
