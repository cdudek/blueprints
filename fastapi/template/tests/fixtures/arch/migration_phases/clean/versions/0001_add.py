import sqlalchemy as sa
from alembic import op

PHASE = "expand"


def upgrade() -> None:
    op.add_column("orders", sa.Column("note", sa.Text(), nullable=True))
    # reviewed: backfills a new nullable column; touches only orders.
    op.execute("UPDATE orders SET note = ''")


def downgrade() -> None:
    op.drop_column("orders", "note")
