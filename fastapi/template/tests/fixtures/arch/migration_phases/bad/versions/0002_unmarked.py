from alembic import op


def upgrade() -> None:
    op.create_index("ix_orders_status", "orders", ["status"])
