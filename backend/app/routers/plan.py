from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import PlanResponse, SessionPlan
from app.services.persistence import get_latest_plan

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("/{user_id}", response_model=PlanResponse)
def get_plan(user_id: str, db: Session = Depends(get_db)) -> PlanResponse:
    plan = get_latest_plan(db, user_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found for user")

    next_session = SessionPlan.model_validate(plan.plan_json["next_session"])
    return PlanResponse(current_week=plan.current_week, next_session=next_session)
