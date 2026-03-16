"""add safety triage fields

Revision ID: 20260316_0005
Revises: 20260316_0004
Create Date: 2026-03-16 02:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260316_0005"
down_revision = "20260316_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "safety_flags",
        sa.Column("severity_score", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "safety_flags",
        sa.Column("escalation_status", sa.String(length=32), nullable=False, server_default="none"),
    )
    op.add_column("safety_flags", sa.Column("triage_notes", sa.Text(), nullable=True))
    op.add_column("safety_flags", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("safety_flags", sa.Column("reviewer_user_id", sa.String(length=64), nullable=True))
    op.create_foreign_key(
        "fk_safety_flags_reviewer_user_id_users",
        "safety_flags",
        "users",
        ["reviewer_user_id"],
        ["id"],
    )
    op.create_index(op.f("ix_safety_flags_severity_score"), "safety_flags", ["severity_score"], unique=False)
    op.create_index(op.f("ix_safety_flags_escalation_status"), "safety_flags", ["escalation_status"], unique=False)
    op.create_index(op.f("ix_safety_flags_reviewer_user_id"), "safety_flags", ["reviewer_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_safety_flags_reviewer_user_id"), table_name="safety_flags")
    op.drop_index(op.f("ix_safety_flags_escalation_status"), table_name="safety_flags")
    op.drop_index(op.f("ix_safety_flags_severity_score"), table_name="safety_flags")
    op.drop_constraint("fk_safety_flags_reviewer_user_id_users", "safety_flags", type_="foreignkey")
    op.drop_column("safety_flags", "reviewer_user_id")
    op.drop_column("safety_flags", "reviewed_at")
    op.drop_column("safety_flags", "triage_notes")
    op.drop_column("safety_flags", "escalation_status")
    op.drop_column("safety_flags", "severity_score")
