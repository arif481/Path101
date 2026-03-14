from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.config import ADMIN_API_KEY
from app.db import get_db
from app.models.db_models import BanditLog, Plan, SafetyFlag, SessionRecord
from app.schemas import (
    ActionAnalyticsItem,
    BanditAnalyticsResponse,
    QueueHealthResponse,
    ResolveFlagRequest,
    SafetyFlagItem,
    SchedulerTickResponse,
    UserAnalyticsItem,
    UserAnalyticsResponse,
    WorkerEventItem,
)
from app.services.redis_queue import queue_health
from app.worker import run_scheduler_tick

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key")


@router.get("/flags", response_model=list[SafetyFlagItem], dependencies=[Depends(require_admin_key)])
def list_flags(
    review_status: str | None = None,
    db: Session = Depends(get_db),
) -> list[SafetyFlagItem]:
    statement = select(SafetyFlag).order_by(SafetyFlag.created_at.desc())
    if review_status:
        statement = statement.where(SafetyFlag.review_status == review_status)

    rows = db.scalars(statement).all()
    return [
        SafetyFlagItem(
            id=row.id,
            user_id=row.user_id,
            trigger_type=row.trigger_type,
            review_status=row.review_status,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/flag/{flag_id}/resolve", dependencies=[Depends(require_admin_key)])
def resolve_flag(flag_id: int, payload: ResolveFlagRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.get(SafetyFlag, flag_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Flag not found")

    row.review_status = payload.review_status
    db.add(row)
    db.commit()
    return {"status": "ok"}


@router.get("/queue-health", response_model=QueueHealthResponse, dependencies=[Depends(require_admin_key)])
def admin_queue_health() -> QueueHealthResponse:
    health = queue_health()
    return QueueHealthResponse(**health)


@router.get("/worker-events", response_model=list[WorkerEventItem], dependencies=[Depends(require_admin_key)])
def admin_worker_events(limit: int = 25, db: Session = Depends(get_db)) -> list[WorkerEventItem]:
    safe_limit = max(1, min(limit, 200))
    statement = select(BanditLog).order_by(BanditLog.timestamp.desc()).limit(safe_limit)
    rows = db.scalars(statement).all()

    response: list[WorkerEventItem] = []
    for row in rows:
        context_source = ""
        if isinstance(row.context_json, dict):
            context_source = str(row.context_json.get("source", ""))

        source = context_source or "unknown"
        if source not in {"worker_queue", "scheduler_nudge"}:
            continue

        response.append(
            WorkerEventItem(
                id=row.id,
                user_id=row.user_id,
                action_id=row.action_id,
                reward=row.reward,
                source=source,
                timestamp=row.timestamp,
            )
        )

    return response


@router.post("/scheduler/tick", response_model=SchedulerTickResponse, dependencies=[Depends(require_admin_key)])
def admin_scheduler_tick() -> SchedulerTickResponse:
    result = run_scheduler_tick()
    return SchedulerTickResponse(**result)


@router.get("/analytics/actions", response_model=BanditAnalyticsResponse, dependencies=[Depends(require_admin_key)])
def admin_action_analytics(
    days: int = 30,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> BanditAnalyticsResponse:
    safe_days = max(1, min(days, 365))
    safe_limit = max(1, min(limit, 50))
    cutoff = datetime.utcnow() - timedelta(days=safe_days)

    total_statement = select(func.count(BanditLog.id)).where(BanditLog.timestamp >= cutoff)
    total_events = int(db.scalar(total_statement) or 0)

    action_statement = (
        select(
            BanditLog.action_id,
            func.count(BanditLog.id),
            func.avg(BanditLog.reward),
            func.max(BanditLog.timestamp),
        )
        .where(BanditLog.timestamp >= cutoff)
        .group_by(BanditLog.action_id)
        .order_by(func.avg(BanditLog.reward).desc(), func.count(BanditLog.id).desc())
        .limit(safe_limit)
    )

    actions: list[ActionAnalyticsItem] = []
    for action_id, count, avg_reward, last_seen in db.execute(action_statement).all():
        if not isinstance(action_id, str) or last_seen is None:
            continue

        actions.append(
            ActionAnalyticsItem(
                action_id=action_id,
                count=int(count or 0),
                avg_reward=float(avg_reward or 0.0),
                last_seen=last_seen,
            )
        )

    return BanditAnalyticsResponse(days=safe_days, total_events=total_events, actions=actions)


def _compute_reward_trend(rewards: list[float]) -> str:
    if len(rewards) < 4:
        return "insufficient"

    midpoint = len(rewards) // 2
    first_half = rewards[:midpoint]
    second_half = rewards[midpoint:]
    if not first_half or not second_half:
        return "insufficient"

    first_avg = sum(first_half) / len(first_half)
    second_avg = sum(second_half) / len(second_half)
    delta = second_avg - first_avg
    if delta > 0.05:
        return "up"
    if delta < -0.05:
        return "down"
    return "flat"


@router.get("/analytics/users", response_model=UserAnalyticsResponse, dependencies=[Depends(require_admin_key)])
def admin_user_analytics(
    days: int = 30,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> UserAnalyticsResponse:
    safe_days = max(1, min(days, 365))
    safe_limit = max(1, min(limit, 100))
    cutoff = datetime.utcnow() - timedelta(days=safe_days)

    sessions_statement = (
        select(
            SessionRecord.user_id,
            func.count(SessionRecord.id),
            func.sum(case((SessionRecord.completed_bool.is_(True), 1), else_=0)),
        )
        .join(Plan, SessionRecord.plan_id == Plan.id)
        .where(Plan.start_date >= cutoff)
        .group_by(SessionRecord.user_id)
    )

    session_stats: dict[str, tuple[int, int]] = {}
    for user_id, total_count, completed_count in db.execute(sessions_statement).all():
        if not isinstance(user_id, str):
            continue
        session_stats[user_id] = (int(total_count or 0), int(completed_count or 0))

    rewards_statement = (
        select(BanditLog.user_id, BanditLog.reward, BanditLog.timestamp)
        .where(BanditLog.timestamp >= cutoff)
        .order_by(BanditLog.user_id.asc(), BanditLog.timestamp.asc())
    )

    reward_series: dict[str, list[float]] = {}
    last_activity: dict[str, datetime] = {}
    for user_id, reward, timestamp in db.execute(rewards_statement).all():
        if not isinstance(user_id, str) or timestamp is None:
            continue

        reward_series.setdefault(user_id, []).append(float(reward or 0.0))
        last_activity[user_id] = timestamp

    user_ids = set(session_stats.keys()) | set(reward_series.keys())
    rows: list[UserAnalyticsItem] = []
    for user_id in user_ids:
        sessions_total, sessions_completed = session_stats.get(user_id, (0, 0))
        completion_rate = (sessions_completed / sessions_total) if sessions_total > 0 else 0.0

        rewards = reward_series.get(user_id, [])
        avg_reward = (sum(rewards) / len(rewards)) if rewards else 0.0
        trend = _compute_reward_trend(rewards)

        rows.append(
            UserAnalyticsItem(
                user_id=user_id,
                sessions_total=sessions_total,
                sessions_completed=sessions_completed,
                completion_rate=completion_rate,
                avg_reward=avg_reward,
                reward_trend=trend,
                last_activity=last_activity.get(user_id),
            )
        )

    rows.sort(key=lambda item: (item.completion_rate, item.avg_reward, item.sessions_total), reverse=True)
    rows = rows[:safe_limit]

    return UserAnalyticsResponse(days=safe_days, total_users=len(rows), users=rows)
