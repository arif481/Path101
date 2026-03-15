from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import redis

from app.config import REDIS_URL

QUEUE_KEY = "path101:session_jobs"
DEAD_LETTER_KEY = "path101:session_jobs:dead_letter"


def _get_client() -> redis.Redis:
    return redis.Redis.from_url(REDIS_URL, decode_responses=True)


def enqueue_session_job(job_type: str, user_id: str, payload: dict[str, Any]) -> bool:
    job = {
        "job_type": job_type,
        "user_id": user_id,
        "payload": payload,
        "attempt": 0,
        "created_at": datetime.utcnow().isoformat(),
    }

    try:
        client = _get_client()
        client.rpush(QUEUE_KEY, json.dumps(job))
        return True
    except redis.RedisError:
        return False


def queue_health() -> dict[str, Any]:
    try:
        client = _get_client()
        size = client.llen(QUEUE_KEY)
        dead_letter_size = client.llen(DEAD_LETTER_KEY)
        return {
            "connected": True,
            "queue_size": int(size),
            "dead_letter_size": int(dead_letter_size),
        }
    except redis.RedisError:
        return {"connected": False, "queue_size": -1, "dead_letter_size": -1}


def dequeue_session_job(timeout_seconds: int = 5) -> dict[str, Any] | None:
    try:
        client = _get_client()
        item = client.blpop(QUEUE_KEY, timeout=timeout_seconds)
        if item is None:
            return None

        _, raw_value = item
        payload = json.loads(raw_value)
        if isinstance(payload, dict):
            return payload
        return None
    except (redis.RedisError, json.JSONDecodeError):
        return None


def requeue_session_job(job: dict[str, Any], reason: str) -> bool:
    updated_job = dict(job)
    updated_job["attempt"] = int(updated_job.get("attempt", 0)) + 1
    updated_job["last_error"] = reason
    updated_job["last_failed_at"] = datetime.utcnow().isoformat()

    try:
        client = _get_client()
        client.rpush(QUEUE_KEY, json.dumps(updated_job))
        return True
    except redis.RedisError:
        return False


def enqueue_dead_letter(job: dict[str, Any], reason: str) -> bool:
    dead_letter_job = dict(job)
    dead_letter_job["dead_letter_reason"] = reason
    dead_letter_job["dead_lettered_at"] = datetime.utcnow().isoformat()

    try:
        client = _get_client()
        client.rpush(DEAD_LETTER_KEY, json.dumps(dead_letter_job))
        return True
    except redis.RedisError:
        return False


def acquire_nudge_lock(lock_key: str, ttl_seconds: int) -> bool:
    redis_key = f"path101:nudge_lock:{lock_key}"
    try:
        client = _get_client()
        acquired = client.set(redis_key, "1", nx=True, ex=ttl_seconds)
        return bool(acquired)
    except redis.RedisError:
        return False
