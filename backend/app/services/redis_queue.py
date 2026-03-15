from __future__ import annotations

import json
import uuid
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
    dead_letter_job.setdefault("dead_letter_id", str(uuid.uuid4()))
    dead_letter_job["dead_letter_reason"] = reason
    dead_letter_job["dead_lettered_at"] = datetime.utcnow().isoformat()

    try:
        client = _get_client()
        client.rpush(DEAD_LETTER_KEY, json.dumps(dead_letter_job))
        return True
    except redis.RedisError:
        return False


def list_dead_letter_jobs(
    limit: int = 50,
    offset: int = 0,
    job_type: str | None = None,
    user_id: str | None = None,
    reason: str | None = None,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    filter_job_type = (job_type or "").strip().lower()
    filter_user_id = (user_id or "").strip().lower()
    filter_reason = (reason or "").strip().lower()

    try:
        client = _get_client()
        raw_items = client.lrange(DEAD_LETTER_KEY, 0, -1)
    except redis.RedisError:
        return []

    filtered_jobs: list[dict[str, Any]] = []
    for raw in reversed(raw_items):
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue

        if not isinstance(payload, dict):
            continue

        payload_job_type = str(payload.get("job_type", "")).strip().lower()
        payload_user_id = str(payload.get("user_id", "")).strip().lower()
        payload_reason = str(payload.get("dead_letter_reason", "")).strip().lower()

        if filter_job_type and payload_job_type != filter_job_type:
            continue
        if filter_user_id and payload_user_id != filter_user_id:
            continue
        if filter_reason and filter_reason not in payload_reason:
            continue

        filtered_jobs.append(payload)

    return filtered_jobs[safe_offset : safe_offset + safe_limit]


def get_dead_letter_job(dead_letter_id: str) -> dict[str, Any] | None:
    target_id = dead_letter_id.strip()
    if not target_id:
        return None

    try:
        client = _get_client()
        raw_items = client.lrange(DEAD_LETTER_KEY, 0, -1)
    except redis.RedisError:
        return None

    for raw in raw_items:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue

        if not isinstance(payload, dict):
            continue

        if str(payload.get("dead_letter_id", "")) == target_id:
            return payload

    return None


def replay_dead_letter_jobs(dead_letter_ids: list[str]) -> tuple[list[str], list[str]]:
    replayed_ids: list[str] = []
    failed_ids: list[str] = []

    for dead_letter_id in dead_letter_ids:
        normalized_id = dead_letter_id.strip()
        if not normalized_id:
            continue

        replayed = replay_dead_letter_job(normalized_id)
        if replayed is None:
            failed_ids.append(normalized_id)
        else:
            replayed_ids.append(normalized_id)

    return replayed_ids, failed_ids


def replay_dead_letter_job(dead_letter_id: str) -> dict[str, Any] | None:
    target_id = dead_letter_id.strip()
    if not target_id:
        return None

    try:
        client = _get_client()
        raw_items = client.lrange(DEAD_LETTER_KEY, 0, -1)
        for raw in raw_items:
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if not isinstance(payload, dict):
                continue

            if str(payload.get("dead_letter_id", "")) != target_id:
                continue

            replay_payload = dict(payload)
            replay_payload.pop("dead_letter_reason", None)
            replay_payload.pop("dead_lettered_at", None)
            replay_payload["attempt"] = 0
            replay_payload["last_error"] = ""
            replay_payload["last_failed_at"] = ""

            removed_count = client.lrem(DEAD_LETTER_KEY, 1, raw)
            if int(removed_count) < 1:
                return None

            client.rpush(QUEUE_KEY, json.dumps(replay_payload))
            return replay_payload
    except redis.RedisError:
        return None

    return None


def acquire_nudge_lock(lock_key: str, ttl_seconds: int) -> bool:
    redis_key = f"path101:nudge_lock:{lock_key}"
    try:
        client = _get_client()
        acquired = client.set(redis_key, "1", nx=True, ex=ttl_seconds)
        return bool(acquired)
    except redis.RedisError:
        return False
