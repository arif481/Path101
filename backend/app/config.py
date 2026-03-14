from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def parse_csv(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default

    return [item.strip() for item in value.split(",") if item.strip()]


def parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_float(value: str | None, default: float) -> float:
    if value is None:
        return default

    try:
        return float(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    jwt_expires_minutes: int
    admin_email_allowlist: list[str]
    redis_url: str
    cors_origins: list[str]
    trusted_hosts: list[str]
    auto_migrate: bool
    scheduler_interval_seconds: int
    nudge_lookahead_minutes: int
    nudge_lookback_hours: int
    nudge_lock_ttl_seconds: int
    bandit_epsilon: float
    bandit_min_history: int
    auth_rate_limit_count: int
    auth_rate_limit_window_seconds: int
    admin_rate_limit_count: int
    admin_rate_limit_window_seconds: int


SETTINGS = Settings(
    app_env=os.getenv("APP_ENV", "development"),
    database_url=os.getenv("DATABASE_URL", "sqlite:///./path101.db"),
    jwt_secret=os.getenv("JWT_SECRET", "dev-only-change-me"),
    jwt_algorithm="HS256",
    jwt_expires_minutes=int(os.getenv("JWT_EXPIRES_MINUTES", "10080")),
    admin_email_allowlist=parse_csv(os.getenv("ADMIN_EMAIL_ALLOWLIST"), []),
    redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    cors_origins=parse_csv(
        os.getenv("CORS_ORIGINS"),
        ["http://127.0.0.1:5173", "http://localhost:5173"],
    ),
    trusted_hosts=parse_csv(
        os.getenv("TRUSTED_HOSTS"),
        ["127.0.0.1", "localhost"],
    ),
    auto_migrate=parse_bool(os.getenv("AUTO_MIGRATE"), False),
    scheduler_interval_seconds=int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "60")),
    nudge_lookahead_minutes=int(os.getenv("NUDGE_LOOKAHEAD_MINUTES", "30")),
    nudge_lookback_hours=int(os.getenv("NUDGE_LOOKBACK_HOURS", "24")),
    nudge_lock_ttl_seconds=int(os.getenv("NUDGE_LOCK_TTL_SECONDS", "86400")),
    bandit_epsilon=parse_float(os.getenv("BANDIT_EPSILON", "0.2"), 0.2),
    bandit_min_history=int(os.getenv("BANDIT_MIN_HISTORY", "3")),
    auth_rate_limit_count=int(os.getenv("AUTH_RATE_LIMIT_COUNT", "30")),
    auth_rate_limit_window_seconds=int(os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60")),
    admin_rate_limit_count=int(os.getenv("ADMIN_RATE_LIMIT_COUNT", "120")),
    admin_rate_limit_window_seconds=int(os.getenv("ADMIN_RATE_LIMIT_WINDOW_SECONDS", "60")),
)


def validate_startup_settings(settings: Settings) -> None:
    if settings.app_env.lower() != "production":
        return

    if settings.jwt_secret == "dev-only-change-me":
        raise RuntimeError("JWT_SECRET must be set in production")

    if not settings.admin_email_allowlist:
        raise RuntimeError("ADMIN_EMAIL_ALLOWLIST must include at least one admin email in production")

    if any(origin.startswith("http://") for origin in settings.cors_origins):
        raise RuntimeError("CORS_ORIGINS should be https:// origins in production")

    if "*" in settings.trusted_hosts:
        raise RuntimeError("TRUSTED_HOSTS cannot include '*' in production")


APP_ENV = SETTINGS.app_env
DATABASE_URL = SETTINGS.database_url
JWT_SECRET = SETTINGS.jwt_secret
JWT_ALGORITHM = SETTINGS.jwt_algorithm
JWT_EXPIRES_MINUTES = SETTINGS.jwt_expires_minutes
ADMIN_EMAIL_ALLOWLIST = [value.strip().lower() for value in SETTINGS.admin_email_allowlist]
REDIS_URL = SETTINGS.redis_url
CORS_ORIGINS = SETTINGS.cors_origins
TRUSTED_HOSTS = SETTINGS.trusted_hosts
AUTO_MIGRATE = SETTINGS.auto_migrate
SCHEDULER_INTERVAL_SECONDS = SETTINGS.scheduler_interval_seconds
NUDGE_LOOKAHEAD_MINUTES = SETTINGS.nudge_lookahead_minutes
NUDGE_LOOKBACK_HOURS = SETTINGS.nudge_lookback_hours
NUDGE_LOCK_TTL_SECONDS = SETTINGS.nudge_lock_ttl_seconds
BANDIT_EPSILON = SETTINGS.bandit_epsilon
BANDIT_MIN_HISTORY = SETTINGS.bandit_min_history
AUTH_RATE_LIMIT_COUNT = SETTINGS.auth_rate_limit_count
AUTH_RATE_LIMIT_WINDOW_SECONDS = SETTINGS.auth_rate_limit_window_seconds
ADMIN_RATE_LIMIT_COUNT = SETTINGS.admin_rate_limit_count
ADMIN_RATE_LIMIT_WINDOW_SECONDS = SETTINGS.admin_rate_limit_window_seconds
