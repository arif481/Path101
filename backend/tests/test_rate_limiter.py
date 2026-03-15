from app.services.rate_limiter import InMemoryRateLimiter


def test_rate_limiter_blocks_after_limit() -> None:
    limiter = InMemoryRateLimiter()
    key = "client:test"

    assert limiter.allow(key, limit=2, window_seconds=60) is True
    assert limiter.allow(key, limit=2, window_seconds=60) is True
    assert limiter.allow(key, limit=2, window_seconds=60) is False
