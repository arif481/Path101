from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Optional

import redis

from app.config import REDIS_URL


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.time()
        threshold = now - max(window_seconds, 1)

        with self._lock:
            queue = self._events[key]
            while queue and queue[0] < threshold:
                queue.popleft()

            if len(queue) >= max(limit, 1):
                return False

            queue.append(now)
            return True


class RedisRateLimiter:
    def __init__(self, redis_url: str, prefix: str = "rate_limit") -> None:
        self._prefix = prefix
        self._client: Optional[redis.Redis] = None
        try:
            self._client = redis.from_url(redis_url, decode_responses=True)
            self._client.ping()
        except redis.RedisError:
            self._client = None

    @property
    def available(self) -> bool:
        return self._client is not None

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        if self._client is None:
            raise RuntimeError("Redis rate limiter is unavailable")

        now_bucket = int(time.time() // max(window_seconds, 1))
        redis_key = f"{self._prefix}:{key}:{now_bucket}"
        pipeline = self._client.pipeline()
        pipeline.incr(redis_key)
        pipeline.expire(redis_key, window_seconds + 1)
        count, _ = pipeline.execute()
        return int(count) <= limit


class RateLimiter:
    def __init__(self) -> None:
        self._redis = RedisRateLimiter(REDIS_URL)
        self._memory = InMemoryRateLimiter()

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        if self._redis.available:
            try:
                return self._redis.allow(key=key, limit=limit, window_seconds=window_seconds)
            except redis.RedisError:
                pass
        return self._memory.allow(key=key, limit=limit, window_seconds=window_seconds)


rate_limiter = RateLimiter()
