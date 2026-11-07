from alembic import op

PHASE = "contract"
LAST_USE_REMOVED_IN = "1.4.0"


def upgrade() -> None:
    op.drop_column("orders", "legacy_total")
