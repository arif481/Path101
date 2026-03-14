"""initial schema

Revision ID: 20260314_0001
Revises:
Create Date: 2026-03-14 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260314_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("country", sa.String(length=16), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=True),
        sa.Column("email_hash", sa.String(length=255), nullable=True),
        sa.Column("consent_flags", sa.JSON(), nullable=False),
        sa.Column("anon_id", sa.String(length=128), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "assessments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("phq2", sa.Integer(), nullable=True),
        sa.Column("gad2", sa.Integer(), nullable=True),
        sa.Column("functional_impairment", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assessments_user_id"), "assessments", ["user_id"], unique=False)

    op.create_table(
        "bandit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("context_json", sa.JSON(), nullable=False),
        sa.Column("action_id", sa.String(length=128), nullable=False),
        sa.Column("policy_version", sa.String(length=64), nullable=False),
        sa.Column("reward", sa.Float(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bandit_logs_user_id"), "bandit_logs", ["user_id"], unique=False)

    op.create_table(
        "plans",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("plan_json", sa.JSON(), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_week", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_plans_user_id"), "plans", ["user_id"], unique=False)

    op.create_table(
        "profiles",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("age_bracket", sa.String(length=32), nullable=True),
        sa.Column("student_flag", sa.Boolean(), nullable=False),
        sa.Column("preferences_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "safety_flags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("trigger_type", sa.String(length=64), nullable=False),
        sa.Column("raw_text_encrypted", sa.Text(), nullable=False),
        sa.Column("review_status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_safety_flags_user_id"), "safety_flags", ["user_id"], unique=False)

    op.create_table(
        "auth_accounts",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("email_hash", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index(op.f("ix_auth_accounts_email_hash"), "auth_accounts", ["email_hash"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("plan_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("session_type", sa.String(length=64), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_bool", sa.Boolean(), nullable=False),
        sa.Column("pre_mood", sa.Integer(), nullable=True),
        sa.Column("post_mood", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_sessions_plan_id"), "sessions", ["plan_id"], unique=False)
    op.create_index(op.f("ix_sessions_user_id"), "sessions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sessions_user_id"), table_name="sessions")
    op.drop_index(op.f("ix_sessions_plan_id"), table_name="sessions")
    op.drop_table("sessions")

    op.drop_index(op.f("ix_auth_accounts_email_hash"), table_name="auth_accounts")
    op.drop_table("auth_accounts")

    op.drop_index(op.f("ix_safety_flags_user_id"), table_name="safety_flags")
    op.drop_table("safety_flags")

    op.drop_table("profiles")

    op.drop_index(op.f("ix_plans_user_id"), table_name="plans")
    op.drop_table("plans")

    op.drop_index(op.f("ix_bandit_logs_user_id"), table_name="bandit_logs")
    op.drop_table("bandit_logs")

    op.drop_index(op.f("ix_assessments_user_id"), table_name="assessments")
    op.drop_table("assessments")

    op.drop_table("users")
