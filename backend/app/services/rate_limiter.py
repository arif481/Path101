from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


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


rate_limiter = InMemoryRateLimiter()
