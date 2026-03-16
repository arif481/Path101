from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import case, func, select

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


def get_notification_analytics(db: Session, *, days: int = 30) -> dict[str, object]:
    safe_days = max(1, min(days, 365))
    cutoff = datetime.utcnow() - timedelta(days=safe_days)

    total_events = int(
        db.scalar(select(func.count(NotificationLog.id)).where(NotificationLog.created_at >= cutoff)) or 0
    )
    delivered = int(
        db.scalar(
            select(func.count(NotificationLog.id)).where(
                NotificationLog.created_at >= cutoff,
                NotificationLog.status == "delivered",
            )
        )
        or 0
    )
    failed = int(
        db.scalar(
            select(func.count(NotificationLog.id)).where(
                NotificationLog.created_at >= cutoff,
                NotificationLog.status == "failed",
            )
        )
        or 0
    )

    by_status_rows = db.execute(
        select(NotificationLog.status, func.count(NotificationLog.id))
        .where(NotificationLog.created_at >= cutoff)
        .group_by(NotificationLog.status)
        .order_by(func.count(NotificationLog.id).desc())
    ).all()
    by_source_rows = db.execute(
        select(NotificationLog.source, func.count(NotificationLog.id))
        .where(NotificationLog.created_at >= cutoff)
        .group_by(NotificationLog.source)
        .order_by(func.count(NotificationLog.id).desc())
    ).all()
    by_channel_rows = db.execute(
        select(
            NotificationLog.channel,
            func.count(NotificationLog.id),
            func.sum(case((NotificationLog.status == "delivered", 1), else_=0)),
            func.sum(case((NotificationLog.status == "failed", 1), else_=0)),
        )
        .where(NotificationLog.created_at >= cutoff)
        .group_by(NotificationLog.channel)
        .order_by(func.count(NotificationLog.id).desc())
    ).all()

    by_status = [{"key": str(key), "count": int(count or 0)} for key, count in by_status_rows]
    by_source = [{"key": str(key), "count": int(count or 0)} for key, count in by_source_rows]

    by_channel: list[dict[str, object]] = []
    for channel, total, channel_delivered, channel_failed in by_channel_rows:
        channel_total = int(total or 0)
        delivered_count = int(channel_delivered or 0)
        failed_count = int(channel_failed or 0)
        rate = (delivered_count / channel_total) if channel_total > 0 else 0.0
        by_channel.append(
            {
                "channel": str(channel),
                "total": channel_total,
                "delivered": delivered_count,
                "failed": failed_count,
                "delivery_rate": round(rate, 6),
            }
        )

    delivery_rate = (delivered / total_events) if total_events > 0 else 0.0
    return {
        "days": safe_days,
        "total_events": total_events,
        "delivered": delivered,
        "failed": failed,
        "delivery_rate": round(delivery_rate, 6),
        "by_status": by_status,
        "by_source": by_source,
        "by_channel": by_channel,
    }
