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


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    jwt_expires_minutes: int
    admin_api_key: str
    redis_url: str
    cors_origins: list[str]
    trusted_hosts: list[str]
    auto_migrate: bool


SETTINGS = Settings(
    app_env=os.getenv("APP_ENV", "development"),
    database_url=os.getenv("DATABASE_URL", "sqlite:///./path101.db"),
    jwt_secret=os.getenv("JWT_SECRET", "dev-only-change-me"),
    jwt_algorithm="HS256",
    jwt_expires_minutes=int(os.getenv("JWT_EXPIRES_MINUTES", "10080")),
    admin_api_key=os.getenv("ADMIN_API_KEY", "change-me-admin-key"),
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
)


def validate_startup_settings(settings: Settings) -> None:
    if settings.app_env.lower() != "production":
        return

    if settings.jwt_secret == "dev-only-change-me":
        raise RuntimeError("JWT_SECRET must be set in production")

    if settings.admin_api_key == "change-me-admin-key":
        raise RuntimeError("ADMIN_API_KEY must be set in production")

    if any(origin.startswith("http://") for origin in settings.cors_origins):
        raise RuntimeError("CORS_ORIGINS should be https:// origins in production")

    if "*" in settings.trusted_hosts:
        raise RuntimeError("TRUSTED_HOSTS cannot include '*' in production")


APP_ENV = SETTINGS.app_env
DATABASE_URL = SETTINGS.database_url
JWT_SECRET = SETTINGS.jwt_secret
JWT_ALGORITHM = SETTINGS.jwt_algorithm
JWT_EXPIRES_MINUTES = SETTINGS.jwt_expires_minutes
ADMIN_API_KEY = SETTINGS.admin_api_key
REDIS_URL = SETTINGS.redis_url
CORS_ORIGINS = SETTINGS.cors_origins
TRUSTED_HOSTS = SETTINGS.trusted_hosts
AUTO_MIGRATE = SETTINGS.auto_migrate
