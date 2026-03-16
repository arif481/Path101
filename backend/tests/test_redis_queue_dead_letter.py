import json
from datetime import datetime, timedelta

from app.services import redis_queue


class FakeRedis:
    def __init__(self) -> None:
        self._lists: dict[str, list[str]] = {}

    def rpush(self, key: str, value: str) -> int:
        self._lists.setdefault(key, []).append(value)
        return len(self._lists[key])

    def lrange(self, key: str, start: int, end: int) -> list[str]:
        values = self._lists.get(key, [])
        length = len(values)
        if length == 0:
            return []

        normalized_start = start if start >= 0 else max(length + start, 0)
        normalized_end = end if end >= 0 else length + end
        normalized_end = min(normalized_end, length - 1)

        if normalized_start > normalized_end:
            return []

        return values[normalized_start : normalized_end + 1]

    def lrem(self, key: str, count: int, value: str) -> int:
        values = self._lists.get(key, [])
        if count <= 0:
            return 0

        removed = 0
        kept: list[str] = []
        for item in values:
            if removed < count and item == value:
                removed += 1
                continue
            kept.append(item)

        self._lists[key] = kept
        return removed



def test_list_dead_letter_jobs_filters_and_paginates(monkeypatch) -> None:
    fake = FakeRedis()
    monkeypatch.setattr(redis_queue, "_get_client", lambda: fake)

    jobs = [
        {
            "dead_letter_id": "a",
            "job_type": "session_completed",
            "user_id": "user_1",
            "dead_letter_reason": "max_retries_exceeded",
        },
        {
            "dead_letter_id": "b",
            "job_type": "session_nudge",
            "user_id": "user_2",
            "dead_letter_reason": "job_processing_failed",
        },
        {
            "dead_letter_id": "c",
            "job_type": "session_completed",
            "user_id": "user_1",
            "dead_letter_reason": "max_retries_exceeded",
        },
    ]

    for item in jobs:
        fake.rpush(redis_queue.DEAD_LETTER_KEY, json.dumps(item))

    filtered = redis_queue.list_dead_letter_jobs(
        limit=10,
        offset=0,
        job_type="session_completed",
        user_id="user_1",
        reason="max_retries",
    )

    assert [item["dead_letter_id"] for item in filtered] == ["c", "a"]

    paged = redis_queue.list_dead_letter_jobs(limit=1, offset=1)
    assert [item["dead_letter_id"] for item in paged] == ["b"]



def test_replay_dead_letter_jobs_requeues_and_reports_failures(monkeypatch) -> None:
    fake = FakeRedis()
    monkeypatch.setattr(redis_queue, "_get_client", lambda: fake)

    first = {
        "dead_letter_id": "dead_1",
        "job_type": "session_completed",
        "user_id": "user_a",
        "attempt": 2,
        "dead_letter_reason": "max_retries_exceeded",
    }
    second = {
        "dead_letter_id": "dead_2",
        "job_type": "session_nudge",
        "user_id": "user_b",
        "attempt": 1,
        "dead_letter_reason": "job_processing_failed",
    }

    fake.rpush(redis_queue.DEAD_LETTER_KEY, json.dumps(first))
    fake.rpush(redis_queue.DEAD_LETTER_KEY, json.dumps(second))

    replayed_ids, failed_ids = redis_queue.replay_dead_letter_jobs(["dead_1", "missing", "dead_2"])

    assert replayed_ids == ["dead_1", "dead_2"]
    assert failed_ids == ["missing"]

    pending_jobs = [json.loads(item) for item in fake.lrange(redis_queue.QUEUE_KEY, 0, -1)]
    assert len(pending_jobs) == 2
    assert all(job.get("attempt") == 0 for job in pending_jobs)

    remaining_dead_letters = fake.lrange(redis_queue.DEAD_LETTER_KEY, 0, -1)
    assert remaining_dead_letters == []


def test_drop_dead_letter_job_removes_one_item(monkeypatch) -> None:
    fake = FakeRedis()
    monkeypatch.setattr(redis_queue, "_get_client", lambda: fake)

    first = {
        "dead_letter_id": "dead_drop_1",
        "job_type": "session_completed",
        "user_id": "user_a",
    }
    second = {
        "dead_letter_id": "dead_drop_2",
        "job_type": "session_nudge",
        "user_id": "user_b",
    }

    fake.rpush(redis_queue.DEAD_LETTER_KEY, json.dumps(first))
    fake.rpush(redis_queue.DEAD_LETTER_KEY, json.dumps(second))

    dropped = redis_queue.drop_dead_letter_job("dead_drop_1")
    assert dropped is not None
    assert dropped.get("dead_letter_id") == "dead_drop_1"

    remaining_ids = [json.loads(item).get("dead_letter_id") for item in fake.lrange(redis_queue.DEAD_LETTER_KEY, 0, -1)]
    assert remaining_ids == ["dead_drop_2"]


def test_drop_dead_letter_jobs_reports_failures(monkeypatch) -> None:
    fake = FakeRedis()
    monkeypatch.setattr(redis_queue, "_get_client", lambda: fake)

    first = {
        "dead_letter_id": "dead_bulk_1",
        "job_type": "session_completed",
        "user_id": "user_a",
    }
    second = {
        "dead_letter_id": "dead_bulk_2",
        "job_type": "session_nudge",
        "user_id": "user_b",
    }

    fake.rpush(redis_queue.DEAD_LETTER_KEY, json.dumps(first))
    fake.rpush(redis_queue.DEAD_LETTER_KEY, json.dumps(second))

    dropped_ids, failed_ids, dropped_payloads = redis_queue.drop_dead_letter_jobs(
        ["dead_bulk_1", "missing", "dead_bulk_2"]
    )

    assert dropped_ids == ["dead_bulk_1", "dead_bulk_2"]
    assert failed_ids == ["missing"]
    assert set(dropped_payloads.keys()) == {"dead_bulk_1", "dead_bulk_2"}
    assert fake.lrange(redis_queue.DEAD_LETTER_KEY, 0, -1) == []


def test_summarize_dead_letter_jobs_counts_by_type_and_reason(monkeypatch) -> None:
    fake = FakeRedis()
    monkeypatch.setattr(redis_queue, "_get_client", lambda: fake)

    fake.rpush(
        redis_queue.DEAD_LETTER_KEY,
        json.dumps(
            {
                "dead_letter_id": "sum_1",
                "job_type": "session_completed",
                "dead_letter_reason": "max_retries_exceeded",
            }
        ),
    )
    fake.rpush(
        redis_queue.DEAD_LETTER_KEY,
        json.dumps(
            {
                "dead_letter_id": "sum_2",
                "job_type": "session_completed",
                "dead_letter_reason": "job_processing_failed",
            }
        ),
    )
    fake.rpush(
        redis_queue.DEAD_LETTER_KEY,
        json.dumps(
            {
                "dead_letter_id": "sum_3",
                "job_type": "session_nudge",
                "dead_letter_reason": "job_processing_failed",
            }
        ),
    )

    summary = redis_queue.summarize_dead_letter_jobs()
    assert summary["total"] == 3

    type_counts = {item["key"]: item["count"] for item in summary["by_job_type"]}
    reason_counts = {item["key"]: item["count"] for item in summary["by_reason"]}
    assert type_counts == {"session_completed": 2, "session_nudge": 1}
    assert reason_counts == {"job_processing_failed": 2, "max_retries_exceeded": 1}


def test_purge_dead_letter_jobs_filters_by_age_and_reason(monkeypatch) -> None:
    fake = FakeRedis()
    monkeypatch.setattr(redis_queue, "_get_client", lambda: fake)

    old_time = (datetime.utcnow() - timedelta(days=45)).isoformat()
    recent_time = (datetime.utcnow() - timedelta(days=5)).isoformat()

    fake.rpush(
        redis_queue.DEAD_LETTER_KEY,
        json.dumps(
            {
                "dead_letter_id": "purge_old",
                "job_type": "session_completed",
                "user_id": "user_x",
                "dead_letter_reason": "max_retries_exceeded",
                "dead_lettered_at": old_time,
            }
        ),
    )
    fake.rpush(
        redis_queue.DEAD_LETTER_KEY,
        json.dumps(
            {
                "dead_letter_id": "purge_recent",
                "job_type": "session_completed",
                "user_id": "user_x",
                "dead_letter_reason": "max_retries_exceeded",
                "dead_lettered_at": recent_time,
            }
        ),
    )

    purged_ids = redis_queue.purge_dead_letter_jobs(
        older_than_days=30,
        job_type="session_completed",
        user_id="user_x",
        reason_contains="max_retries",
        limit=50,
    )

    assert purged_ids == ["purge_old"]

    remaining = [json.loads(item)["dead_letter_id"] for item in fake.lrange(redis_queue.DEAD_LETTER_KEY, 0, -1)]
    assert remaining == ["purge_recent"]
