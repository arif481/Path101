from __future__ import annotations

import logging
import signal
import time
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, select

from app.config import (
    NUDGE_LOCK_TTL_SECONDS,
    NUDGE_LOOKAHEAD_MINUTES,
    NUDGE_LOOKBACK_HOURS,
    SCHEDULER_INTERVAL_SECONDS,
)
from app.db import SessionLocal
from app.models.db_models import BanditLog, SessionRecord
from app.services.redis_queue import acquire_nudge_lock, dequeue_session_job, enqueue_session_job

logger = logging.getLogger("path101.worker")


class WorkerRuntime:
    def __init__(self) -> None:
        self.running = True

    def stop(self, *_: object) -> None:
        self.running = False


def _extract_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def process_job(job: dict[str, Any]) -> bool:
    job_type = str(job.get("job_type", ""))
    if job_type not in {"session_completed", "session_nudge"}:
        logger.info("Skipped unsupported job_type=%s", job_type)
        return True

    user_id = str(job.get("user_id", "")).strip()
    payload = job.get("payload")
    if not user_id or not isinstance(payload, dict):
        logger.warning("Invalid job payload: %s", job)
        return False

    if job_type == "session_completed":
        reward = _extract_float(payload.get("reward"))
        action_id = str(payload.get("session_id", "session_unknown"))
        context_json = {
            "pre_mood": payload.get("pre_mood"),
            "post_mood": payload.get("post_mood"),
            "source": "worker_queue",
        }
    else:
        reward = 0.0
        action_id = f"nudge:{payload.get('session_id', 'session_unknown')}"
        context_json = {
            "scheduled_at": payload.get("scheduled_at"),
            "session_id": payload.get("session_id"),
            "source": "scheduler_nudge",
        }

    db = SessionLocal()
    try:
        bandit_log = BanditLog(
            user_id=user_id,
            context_json=context_json,
            action_id=action_id,
            policy_version="v0",
            reward=reward,
            timestamp=datetime.utcnow(),
        )
        db.add(bandit_log)
        db.commit()
        logger.info("Processed session_completed for user_id=%s action_id=%s", user_id, action_id)
        return True
    except Exception:
        db.rollback()
        logger.exception("Failed processing job")
        return False
    finally:
        db.close()


def run_scheduler_tick() -> dict[str, int]:
    now = datetime.utcnow()
    lookahead_time = now + timedelta(minutes=NUDGE_LOOKAHEAD_MINUTES)
    lookback_time = now - timedelta(hours=NUDGE_LOOKBACK_HOURS)

    db = SessionLocal()
    try:
        statement = select(SessionRecord).where(
            and_(
                SessionRecord.completed_bool.is_(False),
                SessionRecord.scheduled_at.is_not(None),
                SessionRecord.scheduled_at <= lookahead_time,
                SessionRecord.scheduled_at >= lookback_time,
            )
        )
        sessions = db.scalars(statement).all()

        scanned = len(sessions)
        locked = 0
        scheduled = 0
        for session in sessions:
            if session.scheduled_at is None:
                continue

            lock_key = f"{session.id}:{now.date().isoformat()}"
            if not acquire_nudge_lock(lock_key, NUDGE_LOCK_TTL_SECONDS):
                continue

            locked += 1

            enqueued = enqueue_session_job(
                job_type="session_nudge",
                user_id=session.user_id,
                payload={
                    "session_id": session.id,
                    "scheduled_at": session.scheduled_at.isoformat(),
                },
            )
            if enqueued:
                scheduled += 1

        if scheduled:
            logger.info("Scheduler enqueued session_nudge jobs=%s", scheduled)

        return {
            "scanned_sessions": scanned,
            "acquired_locks": locked,
            "enqueued_jobs": scheduled,
        }
    finally:
        db.close()


def run_worker(poll_sleep_seconds: float = 1.0) -> None:
    logging.basicConfig(level=logging.INFO)
    runtime = WorkerRuntime()

    signal.signal(signal.SIGINT, runtime.stop)
    signal.signal(signal.SIGTERM, runtime.stop)

    logger.info("Worker started")
    next_scheduler_run = time.monotonic()

    while runtime.running:
        now = time.monotonic()
        if now >= next_scheduler_run:
            run_scheduler_tick()
            next_scheduler_run = now + max(SCHEDULER_INTERVAL_SECONDS, 5)

        job = dequeue_session_job(timeout_seconds=1)
        if job is None:
            continue

        ok = process_job(job)
        if not ok:
            time.sleep(poll_sleep_seconds)

    logger.info("Worker stopped")


if __name__ == "__main__":
    run_worker()
