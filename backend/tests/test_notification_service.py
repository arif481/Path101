from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import config
from app.db import Base
from app.models.db_models import NotificationLog
from app.services.notification_service import send_user_notification


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
