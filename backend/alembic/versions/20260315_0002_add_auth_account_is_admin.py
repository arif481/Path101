"""add auth account is_admin

Revision ID: 20260315_0002
Revises: 20260314_0001
Create Date: 2026-03-15 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260315_0002"
down_revision = "20260314_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "auth_accounts",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("auth_accounts", "is_admin")
