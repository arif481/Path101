from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import ADMIN_API_KEY
from app.db import get_db
from app.models.db_models import SafetyFlag
from app.schemas import QueueHealthResponse, ResolveFlagRequest, SafetyFlagItem
from app.services.redis_queue import queue_health

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    if not x_admin_key or x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key")


@router.get("/flags", response_model=list[SafetyFlagItem], dependencies=[Depends(require_admin_key)])
def list_flags(
    review_status: str | None = None,
    db: Session = Depends(get_db),
) -> list[SafetyFlagItem]:
    statement = select(SafetyFlag).order_by(SafetyFlag.created_at.desc())
    if review_status:
        statement = statement.where(SafetyFlag.review_status == review_status)

    rows = db.scalars(statement).all()
    return [
        SafetyFlagItem(
            id=row.id,
            user_id=row.user_id,
            trigger_type=row.trigger_type,
            review_status=row.review_status,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/flag/{flag_id}/resolve", dependencies=[Depends(require_admin_key)])
def resolve_flag(flag_id: int, payload: ResolveFlagRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.get(SafetyFlag, flag_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Flag not found")

    row.review_status = payload.review_status
    db.add(row)
    db.commit()
    return {"status": "ok"}


@router.get("/queue-health", response_model=QueueHealthResponse, dependencies=[Depends(require_admin_key)])
def admin_queue_health() -> QueueHealthResponse:
    health = queue_health()
    return QueueHealthResponse(**health)
