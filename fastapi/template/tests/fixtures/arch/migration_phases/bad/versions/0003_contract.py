from alembic import op

PHASE = "contract"


def upgrade() -> None:
    op.drop_column("orders", "legacy_total")
