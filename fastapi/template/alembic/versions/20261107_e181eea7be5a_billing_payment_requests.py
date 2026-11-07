"""billing payment requests

Revision ID: e181eea7be5a
Revises: e9da57659a8a
Create Date: 2026-11-07 18:31:41.649306
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e181eea7be5a"
down_revision: str | Sequence[str] | None = "e9da57659a8a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
PHASE = "expand"


def upgrade() -> None:
    op.create_table(
        "payment_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "requested",
                "processing",
                "succeeded",
                "failed",
                "needs_attention",
                name="payment_request_status",
            ),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("provider_reference", sa.String(length=255), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], name=op.f("fk_payment_requests_order_id_orders")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_requests")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_payment_requests_idempotency_key")),
    )
    op.create_index(
        op.f("ix_payment_requests_order_id"), "payment_requests", ["order_id"], unique=False
    )
    op.create_index(
        op.f("ix_payment_requests_status"), "payment_requests", ["status"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_requests_status"), table_name="payment_requests")
    op.drop_index(op.f("ix_payment_requests_order_id"), table_name="payment_requests")
    op.drop_table("payment_requests")
    sa.Enum(name="payment_request_status").drop(op.get_bind())
