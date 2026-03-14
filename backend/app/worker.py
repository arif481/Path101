from __future__ import annotations

import logging
import signal
import time
from datetime import datetime
from typing import Any

from app.db import SessionLocal
from app.models.db_models import BanditLog
from app.services.redis_queue import dequeue_session_job

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
    if job_type != "session_completed":
        logger.info("Skipped unsupported job_type=%s", job_type)
        return True

    user_id = str(job.get("user_id", "")).strip()
    payload = job.get("payload")
    if not user_id or not isinstance(payload, dict):
        logger.warning("Invalid job payload: %s", job)
        return False

    reward = _extract_float(payload.get("reward"))
    action_id = str(payload.get("session_id", "session_unknown"))

    context_json = {
        "pre_mood": payload.get("pre_mood"),
        "post_mood": payload.get("post_mood"),
        "source": "worker_queue",
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


def run_worker(poll_sleep_seconds: float = 1.0) -> None:
    logging.basicConfig(level=logging.INFO)
    runtime = WorkerRuntime()

    signal.signal(signal.SIGINT, runtime.stop)
    signal.signal(signal.SIGTERM, runtime.stop)

    logger.info("Worker started")

    while runtime.running:
        job = dequeue_session_job(timeout_seconds=5)
        if job is None:
            continue

        ok = process_job(job)
        if not ok:
            time.sleep(poll_sleep_seconds)

    logger.info("Worker stopped")


if __name__ == "__main__":
    run_worker()
