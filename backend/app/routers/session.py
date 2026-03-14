from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import SessionCompleteRequest, SessionCompleteResponse
from app.services.bandit_policy import select_next_recommendation
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
    next_recommendation, action_id, rationale, policy_version = select_next_recommendation(
        db=db,
        user_id=session.user_id,
        base_session_id=session.id,
        feedback=payload.feedback,
    )

    enqueue_session_job(
        job_type="session_completed",
        user_id=session.user_id,
        payload={
            "session_id": session.id,
            "action_id": action_id,
            "policy_version": policy_version,
            "reward": reward,
            "pre_mood": payload.pre_mood,
            "post_mood": payload.post_mood,
            "context": {
                "recommendation_title": next_recommendation.title,
                "recommendation_difficulty": next_recommendation.difficulty,
            },
        },
    )

    return SessionCompleteResponse(
        next_recommendation=next_recommendation,
        reward=reward,
        rationale=rationale,
    )
