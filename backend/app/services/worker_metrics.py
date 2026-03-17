from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.db_models import WorkerMetric


def record_worker_metric(
    db: Session,
    *,
    metric_type: str,
    value: float = 1.0,
    detail: str | None = None,
) -> WorkerMetric:
    row = WorkerMetric(
        metric_type=metric_type,
        value=value,
        detail=detail,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row
