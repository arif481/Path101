"""add dead letter replay audits

Revision ID: 20260316_0003
Revises: 20260315_0002
Create Date: 2026-03-16 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260316_0003"
down_revision = "20260315_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dead_letter_replay_audits",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dead_letter_id", sa.String(length=64), nullable=False),
        sa.Column("job_type", sa.String(length=64), nullable=False),
        sa.Column("job_user_id", sa.String(length=64), nullable=False),
        sa.Column("admin_user_id", sa.String(length=64), nullable=False),
        sa.Column("replay_status", sa.String(length=32), nullable=False),
        sa.Column("replayed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["admin_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_dead_letter_replay_audits_dead_letter_id"),
        "dead_letter_replay_audits",
        ["dead_letter_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_dead_letter_replay_audits_job_user_id"),
        "dead_letter_replay_audits",
        ["job_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_dead_letter_replay_audits_admin_user_id"),
        "dead_letter_replay_audits",
        ["admin_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dead_letter_replay_audits_admin_user_id"), table_name="dead_letter_replay_audits")
    op.drop_index(op.f("ix_dead_letter_replay_audits_job_user_id"), table_name="dead_letter_replay_audits")
    op.drop_index(op.f("ix_dead_letter_replay_audits_dead_letter_id"), table_name="dead_letter_replay_audits")
    op.drop_table("dead_letter_replay_audits")
