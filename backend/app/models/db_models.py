from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    country: Mapped[str | None] = mapped_column(String(16), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    consent_flags: Mapped[dict] = mapped_column(JSON, default=dict)
    anon_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)
    plans: Mapped[list["Plan"]] = relationship(back_populates="user")
    auth_account: Mapped["AuthAccount"] = relationship(back_populates="user", uselist=False)


class AuthAccount(Base):
    __tablename__ = "auth_accounts"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    email_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="auth_account")


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    age_bracket: Mapped[str | None] = mapped_column(String(32), nullable=True)
    student_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    preferences_json: Mapped[dict] = mapped_column(JSON, default=dict)

    user: Mapped[User] = relationship(back_populates="profile")


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    phq2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gad2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    functional_impairment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    plan_json: Mapped[dict] = mapped_column(JSON)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_week: Mapped[int] = mapped_column(Integer, default=1)

    user: Mapped[User] = relationship(back_populates="plans")


class SessionRecord(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    session_type: Mapped[str] = mapped_column(String(64), default="micro")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_bool: Mapped[bool] = mapped_column(Boolean, default=False)
    pre_mood: Mapped[int | None] = mapped_column(Integer, nullable=True)
    post_mood: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)


class BanditLog(Base):
    __tablename__ = "bandit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    context_json: Mapped[dict] = mapped_column(JSON)
    action_id: Mapped[str] = mapped_column(String(128))
    policy_version: Mapped[str] = mapped_column(String(64))
    reward: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class SafetyFlag(Base):
    __tablename__ = "safety_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    trigger_type: Mapped[str] = mapped_column(String(64))
    raw_text_encrypted: Mapped[str] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class DeadLetterReplayAudit(Base):
    __tablename__ = "dead_letter_replay_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dead_letter_id: Mapped[str] = mapped_column(String(64), index=True)
    job_type: Mapped[str] = mapped_column(String(64))
    job_user_id: Mapped[str] = mapped_column(String(64), index=True)
    admin_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    replay_status: Mapped[str] = mapped_column(String(32))
    replayed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
