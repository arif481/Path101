from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.db_models import Plan, SafetyFlag, SessionRecord, User
from app.schemas import PlanPreview, SessionPlan


def ensure_user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user:
        return user

    user = User(id=user_id, created_at=datetime.utcnow(), consent_flags={})
    db.add(user)
    db.flush()
    return user


def save_plan(db: Session, user_id: str, plan: PlanPreview) -> Plan:
    ensure_user(db, user_id)

    plan_row = Plan(
        id=plan.plan_id,
        user_id=user_id,
        plan_json=plan.model_dump(mode="json"),
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(weeks=plan.duration_weeks),
        current_week=plan.current_week,
    )
    db.add(plan_row)

    session = plan.next_session
    session_row = SessionRecord(
        id=session.session_id,
        plan_id=plan.plan_id,
        user_id=user_id,
        session_type="micro",
        scheduled_at=session.scheduled_at,
        completed_bool=False,
    )
    db.add(session_row)
    db.flush()

    return plan_row


def add_safety_flag(db: Session, user_id: str, raw_text: str, trigger_type: str = "crisis_language") -> SafetyFlag:
    ensure_user(db, user_id)
    flag = SafetyFlag(
        user_id=user_id,
        trigger_type=trigger_type,
        raw_text_encrypted=raw_text,
        review_status="pending",
    )
    db.add(flag)
    db.flush()
    return flag


def get_latest_plan(db: Session, user_id: str) -> Plan | None:
    statement = select(Plan).where(Plan.user_id == user_id).order_by(desc(Plan.start_date)).limit(1)
    return db.scalar(statement)


def get_session(db: Session, session_id: str) -> SessionRecord | None:
    return db.get(SessionRecord, session_id)


def complete_session(db: Session, session_id: str, pre_mood: int, post_mood: int, feedback: str) -> SessionRecord | None:
    session = db.get(SessionRecord, session_id)
    if session is None:
        return None

    session.completed_bool = True
    session.pre_mood = pre_mood
    session.post_mood = post_mood
    session.feedback = feedback
    db.add(session)
    db.flush()
    return session


def plan_to_session_plan(plan_row: Plan) -> SessionPlan:
    payload = plan_row.plan_json["next_session"]
    return SessionPlan.model_validate(payload)
