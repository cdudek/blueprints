"""procrastinate 3.10.0 schema

Revision ID: 7807d1c8a26c
Revises: e181eea7be5a
Create Date: 2026-11-07 19:05:00.000000

The job queue's tables, types and functions, from the schema.sql that ships with the pinned
Procrastinate version (copied to alembic/sql/ verbatim, except one comment's dash, by this
repository's punctuation rule). A Procrastinate upgrade adds its migration files
from procrastinate/sql/migrations as new revisions; this file never changes.
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "7807d1c8a26c"
down_revision: str | Sequence[str] | None = "e181eea7be5a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
PHASE = "expand"

SCHEMA = Path(__file__).resolve().parents[1] / "sql" / "procrastinate-3.10.0.sql"

DROP_ALL = """
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS fn FROM pg_proc WHERE proname LIKE 'procrastinate%' LOOP
    EXECUTE 'DROP FUNCTION ' || r.fn || ' CASCADE';
  END LOOP;
END $$;
DROP TABLE IF EXISTS procrastinate_events, procrastinate_periodic_defers, procrastinate_jobs,
  procrastinate_workers CASCADE;
DROP TYPE IF EXISTS procrastinate_job_to_defer_v1, procrastinate_job_event_type,
  procrastinate_job_status;
"""


def _escaped(sql: str) -> str:
    return sql.replace("%", "%%")  # the driver treats % as a placeholder


def upgrade() -> None:
    # reviewed: the vendored Procrastinate schema; creates only procrastinate_* objects.
    op.get_bind().exec_driver_sql(_escaped(SCHEMA.read_text(encoding="utf-8")))


def downgrade() -> None:
    # reviewed: drops only procrastinate_* objects.
    op.get_bind().exec_driver_sql(_escaped(DROP_ALL))
