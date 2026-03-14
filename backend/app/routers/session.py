from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import SessionCompleteRequest, SessionCompleteResponse, SessionPlan
from app.services.intake import compute_reward
from app.services.persistence import complete_session as complete_session_record
from app.services.redis_queue import enqueue_session_job

router = APIRouter(prefix="/session", tags=["session"])


@router.post("/{session_id}/complete", response_model=SessionCompleteResponse)
def complete_session(
    session_id: str,
    payload: SessionCompleteRequest,
    db: Session = Depends(get_db),
) -> SessionCompleteResponse:
    session = complete_session_record(db, session_id, payload.pre_mood, payload.post_mood, payload.feedback)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    db.commit()

    reward = compute_reward(payload.pre_mood, payload.post_mood, returned_24h=False)
    enqueue_session_job(
        job_type="session_completed",
        user_id=session.user_id,
        payload={
            "session_id": session.id,
            "reward": reward,
            "pre_mood": payload.pre_mood,
            "post_mood": payload.post_mood,
        },
    )

    next_recommendation = SessionPlan.model_validate(
        {
            "session_id": f"{session_id}_next",
            "title": "Recovery micro-step",
            "duration_mins": 10,
            "steps": [
                {"title": "2-minute setup", "duration_mins": 2},
                {"title": "8-minute focused burst", "duration_mins": 8},
            ],
            "expected_metrics": ["completion", "mood_change"],
            "difficulty": "low",
            "scheduled_at": None,
        }
    )

    rationale = "Short session selected to improve consistency after recent variability."

    return SessionCompleteResponse(
        next_recommendation=next_recommendation,
        reward=reward,
        rationale=rationale,
    )
