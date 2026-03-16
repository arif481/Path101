from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app import config
from app.models.db_models import NotificationLog


def _normalize_channel(channel: str) -> str:
    return channel.strip().lower()


def _is_channel_enabled(channel: str) -> bool:
    enabled_channels = set(config.NOTIFICATION_CHANNELS)
    return _normalize_channel(channel) in enabled_channels


def send_user_notification(
    *,
    db: Session,
    user_id: str,
    channel: str,
    message: str,
    source: str,
    metadata: dict | None = None,
) -> NotificationLog:
    normalized_channel = _normalize_channel(channel)
    payload = metadata or {}

    if not _is_channel_enabled(normalized_channel):
        status = "failed"
        error_detail = f"channel_disabled:{normalized_channel}"
    elif not message.strip():
        status = "failed"
        error_detail = "empty_message"
    else:
        status = "delivered"
        error_detail = None

    entry = NotificationLog(
        user_id=user_id,
        channel=normalized_channel,
        status=status,
        source=source.strip() or "unknown",
        message=message,
        metadata_json=payload,
        error_detail=error_detail,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.flush()
    return entry
