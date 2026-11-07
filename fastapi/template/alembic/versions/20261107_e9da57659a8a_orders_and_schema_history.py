"""orders and schema history

Revision ID: e9da57659a8a
Revises:
Create Date: 2026-11-07 18:28:18.280789
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e9da57659a8a"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
PHASE = "expand"


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.String(length=255), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending_payment", "paid", "payment_failed", "cancelled", name="order_status"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount_cents > 0", name=op.f("ck_orders_amount_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_orders")),
    )
    op.create_index(op.f("ix_orders_customer_id"), "orders", ["customer_id"], unique=False)
    op.create_table(
        "schema_history",
        sa.Column("revision", sa.String(length=64), nullable=False),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("revision", name=op.f("pk_schema_history")),
    )


def downgrade() -> None:
    op.drop_table("schema_history")
    op.drop_index(op.f("ix_orders_customer_id"), table_name="orders")
    op.drop_table("orders")
    sa.Enum(name="order_status").drop(op.get_bind())
