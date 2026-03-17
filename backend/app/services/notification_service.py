from __future__ import annotations

from datetime import datetime, timedelta
import json
import smtplib
from email.message import EmailMessage
from urllib import request as urllib_request

from sqlalchemy import case, func, select

from sqlalchemy.orm import Session

from app import config
from app.models.db_models import AuthAccount, NotificationLog


def _normalize_channel(channel: str) -> str:
    return channel.strip().lower()


def _is_channel_enabled(channel: str) -> bool:
    enabled_channels = set(config.NOTIFICATION_CHANNELS)
    return _normalize_channel(channel) in enabled_channels


def _deliver_in_app(*, user_id: str, message: str) -> tuple[bool, str | None]:
    if not user_id.strip() or not message.strip():
        return (False, "invalid_payload")
    return (True, None)


def _deliver_email(*, db: Session, user_id: str, message: str, source: str) -> tuple[bool, str | None]:
    account = db.get(AuthAccount, user_id)
    to_email = (account.email_address or "").strip() if account else ""
    if not to_email:
        return (False, "missing_email")
    if not config.SMTP_HOST or not config.SMTP_FROM_EMAIL:
        return (False, "smtp_not_configured")

    email = EmailMessage()
    email["Subject"] = f"Path101 notification ({source})"
    email["From"] = config.SMTP_FROM_EMAIL
    email["To"] = to_email
    email.set_content(message)

    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as client:
            client.starttls()
            if config.SMTP_USER:
                client.login(config.SMTP_USER, config.SMTP_PASSWORD)
            client.send_message(email)
        return (True, None)
    except Exception as error:
        return (False, f"smtp_error:{type(error).__name__}")


def _deliver_webhook(*, user_id: str, message: str, source: str, metadata: dict) -> tuple[bool, str | None]:
    if not config.NOTIFICATION_WEBHOOK_URL:
        return (False, "webhook_not_configured")

    payload = json.dumps(
        {
            "user_id": user_id,
            "source": source,
            "message": message,
            "metadata": metadata,
            "created_at": datetime.utcnow().isoformat(),
        }
    ).encode("utf-8")
    req = urllib_request.Request(
        config.NOTIFICATION_WEBHOOK_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=10) as response:
            status = int(getattr(response, "status", 0) or 0)
        if 200 <= status < 300:
            return (True, None)
        return (False, f"webhook_status:{status}")
    except Exception as error:
        return (False, f"webhook_error:{type(error).__name__}")


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
        delivered = False
        detail = None
        if normalized_channel == "in_app":
            delivered, detail = _deliver_in_app(user_id=user_id, message=message)
        elif normalized_channel == "email":
            delivered, detail = _deliver_email(
                db=db,
                user_id=user_id,
                message=message,
                source=source,
            )
        elif normalized_channel == "webhook":
            delivered, detail = _deliver_webhook(
                user_id=user_id,
                message=message,
                source=source,
                metadata=payload,
            )
        else:
            detail = f"unsupported_channel:{normalized_channel}"

        status = "delivered" if delivered else "failed"
        error_detail = detail

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
    by_day_rows = db.execute(
        select(func.date(NotificationLog.created_at), func.count(NotificationLog.id))
        .where(NotificationLog.created_at >= cutoff)
        .group_by(func.date(NotificationLog.created_at))
        .order_by(func.date(NotificationLog.created_at).asc())
    ).all()
    failure_reason_rows = db.execute(
        select(NotificationLog.error_detail, func.count(NotificationLog.id))
        .where(
            NotificationLog.created_at >= cutoff,
            NotificationLog.status == "failed",
            NotificationLog.error_detail.is_not(None),
        )
        .group_by(NotificationLog.error_detail)
        .order_by(func.count(NotificationLog.id).desc())
        .limit(10)
    ).all()

    by_status = [{"key": str(key), "count": int(count or 0)} for key, count in by_status_rows]
    by_source = [{"key": str(key), "count": int(count or 0)} for key, count in by_source_rows]
    by_day = [{"key": str(key), "count": int(count or 0)} for key, count in by_day_rows]
    failure_reasons = [
        {"key": str(key), "count": int(count or 0)}
        for key, count in failure_reason_rows
        if key is not None
    ]

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
        "by_day": by_day,
        "failure_reasons": failure_reasons,
    }
