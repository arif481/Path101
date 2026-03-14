from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import IntakeRequest, IntakeResponse
from app.services.intake import compile_plan, detect_crisis_language
from app.services.persistence import add_safety_flag, save_plan
from app.services.redis_queue import enqueue_session_job

router = APIRouter(prefix="/intake", tags=["intake"])


@router.post("", response_model=IntakeResponse)
def intake(payload: IntakeRequest, db: Session = Depends(get_db)) -> IntakeResponse:
    if detect_crisis_language(payload.text):
        plan_preview, _ = compile_plan(payload.user_id, payload.text, payload.available_times)
        add_safety_flag(db, payload.user_id, payload.text)
        db.commit()
        return IntakeResponse(
            plan_preview=plan_preview,
            smart_goal="Safety first: connect to urgent help resources now.",
            safety_triggered=True,
            triage_message="If you might be in immediate danger, call your local emergency number now. Open the Safety Plan worksheet to continue with support.",
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
