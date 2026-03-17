from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import config
from app.db import Base
from app.models.db_models import NotificationLog
from app.services.notification_service import get_notification_analytics, send_user_notification


def _session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return factory()


def test_send_user_notification_delivered(monkeypatch) -> None:
    db = _session()
    monkeypatch.setattr(config, "NOTIFICATION_CHANNELS", ["in_app", "email"])

    try:
        row = send_user_notification(
            db=db,
            user_id="user_notify",
            channel="in_app",
            message="hello",
            source="unit_test",
            metadata={"k": "v"},
        )
        db.commit()

        assert row.status == "delivered"
        persisted = db.get(NotificationLog, row.id)
        assert persisted is not None
        assert persisted.channel == "in_app"
        assert persisted.source == "unit_test"
    finally:
        db.close()


def test_send_user_notification_disabled_channel_fails(monkeypatch) -> None:
    db = _session()
    monkeypatch.setattr(config, "NOTIFICATION_CHANNELS", ["in_app"])

    try:
        row = send_user_notification(
            db=db,
            user_id="user_notify",
            channel="sms",
            message="hello",
            source="unit_test",
        )
        db.commit()

        assert row.status == "failed"
        assert row.error_detail == "channel_disabled:sms"
    finally:
        db.close()


def test_get_notification_analytics_breakdowns(monkeypatch) -> None:
    db = _session()
    monkeypatch.setattr(config, "NOTIFICATION_CHANNELS", ["in_app", "email"])

    try:
        send_user_notification(
            db=db,
            user_id="u1",
            channel="in_app",
            message="a",
            source="session_nudge",
        )
        send_user_notification(
            db=db,
            user_id="u2",
            channel="in_app",
            message="b",
            source="admin_test_send",
        )
        send_user_notification(
            db=db,
            user_id="u3",
            channel="sms",
            message="c",
            source="session_nudge",
        )
        db.commit()

        analytics = get_notification_analytics(db, days=30)

        assert analytics["total_events"] == 3
        assert analytics["delivered"] == 2
        assert analytics["failed"] == 1
        assert abs(float(analytics["delivery_rate"]) - (2 / 3)) < 1e-6

        by_status = {item["key"]: item["count"] for item in analytics["by_status"]}
        assert by_status.get("delivered") == 2
        assert by_status.get("failed") == 1

        by_source = {item["key"]: item["count"] for item in analytics["by_source"]}
        assert by_source.get("session_nudge") == 2
        assert by_source.get("admin_test_send") == 1

        by_channel = {item["channel"]: item for item in analytics["by_channel"]}
        assert by_channel["in_app"]["delivered"] == 2
        assert by_channel["sms"]["failed"] == 1
    finally:
        db.close()
