import sqlalchemy as sa
from alembic import op

PHASE = "expand"


def upgrade() -> None:
    op.drop_column("orders", "note")
    op.alter_column("orders", "currency", nullable=False)
    op.alter_column("orders", "amount_cents", type_=sa.SmallInteger())
    op.execute("UPDATE orders SET currency = 'EUR'")


def downgrade() -> None:
    op.add_column("orders", sa.Column("note", sa.Text()))
