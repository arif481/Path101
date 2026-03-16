from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import IntakeRequest, IntakeResponse
from app.services.intake import compile_plan
from app.services.persistence import add_safety_flag, save_plan
from app.services.redis_queue import enqueue_session_job
from app.services.safety_triage import evaluate_safety_text

router = APIRouter(prefix="/intake", tags=["intake"])


@router.post("", response_model=IntakeResponse)
def intake(payload: IntakeRequest, db: Session = Depends(get_db)) -> IntakeResponse:
    triage = evaluate_safety_text(payload.text)
    if bool(triage.get("triggered")):
        plan_preview, _ = compile_plan(payload.user_id, payload.text, payload.available_times)
        add_safety_flag(
            db,
            payload.user_id,
            payload.text,
            trigger_type=str(triage.get("trigger_type") or "crisis_language"),
            severity_score=int(triage.get("severity_score") or 0),
            escalation_status=str(triage.get("escalation_status") or "none"),
            triage_notes=str(triage.get("triage_message") or "") or None,
        )
        db.commit()
        return IntakeResponse(
            plan_preview=plan_preview,
            smart_goal="Safety first: connect to urgent help resources now.",
            safety_triggered=True,
            triage_message=str(triage.get("triage_message") or ""),
        )

    plan, smart_goal = compile_plan(payload.user_id, payload.text, payload.available_times)
    save_plan(db, payload.user_id, plan)
    enqueue_session_job(
        job_type="schedule_session_nudge",
        user_id=payload.user_id,
        payload={
            "session_id": plan.next_session.session_id,
            "scheduled_at": plan.next_session.scheduled_at.isoformat() if plan.next_session.scheduled_at else None,
        },
    )
    db.commit()

    return IntakeResponse(plan_preview=plan, smart_goal=smart_goal)
