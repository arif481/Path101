"""add notification logs

Revision ID: 20260316_0004
Revises: 20260316_0003
Create Date: 2026-03-16 01:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260316_0004"
down_revision = "20260316_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notification_logs_user_id"), "notification_logs", ["user_id"], unique=False)
    op.create_index(op.f("ix_notification_logs_channel"), "notification_logs", ["channel"], unique=False)
    op.create_index(op.f("ix_notification_logs_status"), "notification_logs", ["status"], unique=False)
    op.create_index(op.f("ix_notification_logs_source"), "notification_logs", ["source"], unique=False)
    op.create_index(op.f("ix_notification_logs_created_at"), "notification_logs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_notification_logs_created_at"), table_name="notification_logs")
    op.drop_index(op.f("ix_notification_logs_source"), table_name="notification_logs")
    op.drop_index(op.f("ix_notification_logs_status"), table_name="notification_logs")
    op.drop_index(op.f("ix_notification_logs_channel"), table_name="notification_logs")
    op.drop_index(op.f("ix_notification_logs_user_id"), table_name="notification_logs")
    op.drop_table("notification_logs")
