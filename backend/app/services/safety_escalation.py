from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import SafetyEscalationEvent
from app.services.notification_service import send_user_notification


ESCALATION_CHANNEL = "webhook"


def create_safety_escalation_event(
    db: Session,
    *,
    user_id: str,
    escalation_status: str,
    detail: str,
    safety_flag_id: int | None = None,
) -> SafetyEscalationEvent:
    row = SafetyEscalationEvent(
        safety_flag_id=safety_flag_id,
        user_id=user_id,
        escalation_status=escalation_status,
        channel=ESCALATION_CHANNEL,
        status="queued",
        detail=detail,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()

    notification = send_user_notification(
        db=db,
        user_id=user_id,
        channel=ESCALATION_CHANNEL,
        message=detail,
        source="safety_escalation",
        metadata={
            "safety_flag_id": safety_flag_id,
            "escalation_status": escalation_status,
        },
    )
    row.status = "delivered" if notification.status == "delivered" else "failed"
    db.add(row)
    db.flush()
    return row
