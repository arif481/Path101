"""add auth lifecycle, rbac, escalation, and worker metrics

Revision ID: 20260317_0006
Revises: 20260316_0005
Create Date: 2026-03-17 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260317_0006"
down_revision = "20260316_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auth_accounts", sa.Column("email_address", sa.String(length=255), nullable=True))
    op.add_column(
        "auth_accounts",
        sa.Column("role", sa.String(length=64), nullable=False, server_default="user"),
    )
    op.add_column(
        "auth_accounts",
        sa.Column("permissions_json", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.create_unique_constraint("uq_auth_accounts_email_address", "auth_accounts", ["email_address"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)
    op.create_index(op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"], unique=True)
    op.create_index(op.f("ix_refresh_tokens_expires_at"), "refresh_tokens", ["expires_at"], unique=False)

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_password_reset_tokens_user_id"), "password_reset_tokens", ["user_id"], unique=False)
    op.create_index(op.f("ix_password_reset_tokens_token_hash"), "password_reset_tokens", ["token_hash"], unique=True)
    op.create_index(op.f("ix_password_reset_tokens_expires_at"), "password_reset_tokens", ["expires_at"], unique=False)

    op.create_table(
        "safety_escalation_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("safety_flag_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("escalation_status", sa.String(length=32), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False, server_default="webhook"),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["safety_flag_id"], ["safety_flags.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_safety_escalation_events_safety_flag_id"),
        "safety_escalation_events",
        ["safety_flag_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_safety_escalation_events_user_id"),
        "safety_escalation_events",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_safety_escalation_events_escalation_status"),
        "safety_escalation_events",
        ["escalation_status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_safety_escalation_events_status"),
        "safety_escalation_events",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_safety_escalation_events_created_at"),
        "safety_escalation_events",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "worker_metrics",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("metric_type", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False, server_default="0"),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_worker_metrics_metric_type"), "worker_metrics", ["metric_type"], unique=False)
    op.create_index(op.f("ix_worker_metrics_created_at"), "worker_metrics", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_worker_metrics_created_at"), table_name="worker_metrics")
    op.drop_index(op.f("ix_worker_metrics_metric_type"), table_name="worker_metrics")
    op.drop_table("worker_metrics")

    op.drop_index(op.f("ix_safety_escalation_events_created_at"), table_name="safety_escalation_events")
    op.drop_index(op.f("ix_safety_escalation_events_status"), table_name="safety_escalation_events")
    op.drop_index(op.f("ix_safety_escalation_events_escalation_status"), table_name="safety_escalation_events")
    op.drop_index(op.f("ix_safety_escalation_events_user_id"), table_name="safety_escalation_events")
    op.drop_index(op.f("ix_safety_escalation_events_safety_flag_id"), table_name="safety_escalation_events")
    op.drop_table("safety_escalation_events")

    op.drop_index(op.f("ix_password_reset_tokens_expires_at"), table_name="password_reset_tokens")
    op.drop_index(op.f("ix_password_reset_tokens_token_hash"), table_name="password_reset_tokens")
    op.drop_index(op.f("ix_password_reset_tokens_user_id"), table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")

    op.drop_index(op.f("ix_refresh_tokens_expires_at"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_constraint("uq_auth_accounts_email_address", "auth_accounts", type_="unique")
    op.drop_column("auth_accounts", "permissions_json")
    op.drop_column("auth_accounts", "role")
    op.drop_column("auth_accounts", "email_address")
