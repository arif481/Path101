from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import redis

from app.config import REDIS_URL

QUEUE_KEY = "path101:session_jobs"


def _get_client() -> redis.Redis:
    return redis.Redis.from_url(REDIS_URL, decode_responses=True)


def enqueue_session_job(job_type: str, user_id: str, payload: dict[str, Any]) -> bool:
    job = {
        "job_type": job_type,
        "user_id": user_id,
        "payload": payload,
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
        return {"connected": True, "queue_size": int(size)}
    except redis.RedisError:
        return {"connected": False, "queue_size": -1}


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
