from datetime import datetime, timedelta
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.db_models import (
    BanditLog,
    DeadLetterReplayAudit,
    NotificationLog,
    Plan,
    SafetyFlag,
    SafetyEscalationEvent,
    SessionRecord,
    User,
    WorkerMetric,
)
from app.schemas import (
    ActionAnalyticsItem,
    AdminPermissionProfile,
    AdminPermissionUpdateRequest,
    DeadLetterBulkDropRequest,
    DeadLetterBulkDropResponse,
    BanditAnalyticsResponse,
    DeadLetterBulkReplayRequest,
    DeadLetterBulkReplayResponse,
    DeadLetterDropResponse,
    DeadLetterPurgeRequest,
    DeadLetterPurgeResponse,
    DeadLetterSummaryResponse,
    DeadLetterJobItem,
    DeadLetterReplayAuditItem,
    DeadLetterReplayResponse,
    NotificationLogItem,
    NotificationAnalyticsResponse,
    NotificationSendRequest,
    NotificationSendResponse,
    QueueHealthResponse,
    ResolveFlagRequest,
    SafetyFlagItem,
    SafetyFlagAnalyticsBucket,
    SafetyFlagAnalyticsResponse,
    SchedulerTickResponse,
    SafetyEscalationEventItem,
    RetentionMaintenanceRequest,
    RetentionMaintenanceResponse,
    TriageFlagRequest,
    UserAnalyticsItem,
    UserAnalyticsResponse,
    WorkerMetricItem,
    WorkerMetricsResponse,
    WorkerEventItem,
)
from app.config import WORKER_ALERT_FAILURE_RATE
from app.security import admin_rate_limit, get_current_admin_user, require_admin_permission
from app.services.redis_queue import (
    drop_dead_letter_job,
    drop_dead_letter_jobs,
    get_dead_letter_job,
    list_dead_letter_jobs,
    purge_dead_letter_jobs,
    queue_health,
    replay_dead_letter_job,
    replay_dead_letter_jobs,
    summarize_dead_letter_jobs,
)
from app.services.notification_service import get_notification_analytics, send_user_notification
from app.services.safety_escalation import create_safety_escalation_event
from app.services.worker_metrics import record_worker_metric
from app.worker import run_scheduler_tick

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get(
    "/rbac/{user_id}",
    response_model=AdminPermissionProfile,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("maintenance:write"))],
)
def admin_get_rbac(user_id: str, db: Session = Depends(get_db)) -> AdminPermissionProfile:
    account = db.get(User, user_id)
    if account is None or account.auth_account is None:
        raise HTTPException(status_code=404, detail="User not found")

    auth_account = account.auth_account
    permissions_json = auth_account.permissions_json if isinstance(auth_account.permissions_json, dict) else {}
    permissions = permissions_json.get("permissions") if isinstance(permissions_json, dict) else []
    normalized = [str(item).strip().lower() for item in (permissions or []) if str(item).strip()]

    return AdminPermissionProfile(user_id=user_id, role=auth_account.role or "admin", permissions=normalized)


@router.post(
    "/rbac/{user_id}",
    response_model=AdminPermissionProfile,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("maintenance:write"))],
)
def admin_set_rbac(
    user_id: str,
    payload: AdminPermissionUpdateRequest,
    db: Session = Depends(get_db),
) -> AdminPermissionProfile:
    user = db.get(User, user_id)
    if user is None or user.auth_account is None:
        raise HTTPException(status_code=404, detail="User not found")

    account = user.auth_account
    account.is_admin = True
    account.role = payload.role.strip().lower() or "admin"
    permissions = [item.strip().lower() for item in payload.permissions if item.strip()]
    account.permissions_json = {"permissions": permissions}
    db.add(account)
    db.commit()
    return AdminPermissionProfile(user_id=user_id, role=account.role, permissions=permissions)


def _parse_iso_datetime(value: object) -> datetime | None:
    if value is None:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


@router.get(
    "/flags",
    response_model=list[SafetyFlagItem],
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("flags:read"))],
)
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
            severity_score=row.severity_score,
            escalation_status=row.escalation_status,
            review_status=row.review_status,
            triage_notes=row.triage_notes,
            reviewed_at=row.reviewed_at,
            reviewer_user_id=row.reviewer_user_id,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post(
    "/flag/{flag_id}/resolve",
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("flags:write"))],
)
def resolve_flag(
    flag_id: int,
    payload: ResolveFlagRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
) -> dict[str, str]:
    row = db.get(SafetyFlag, flag_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Flag not found")

    row.review_status = payload.review_status
    row.reviewed_at = datetime.utcnow()
    row.reviewer_user_id = admin_user.id
    if payload.review_status in {"resolved", "dismissed"} and row.escalation_status == "urgent":
        row.escalation_status = "watch"
    db.add(row)
    db.commit()
    return {"status": "ok"}


@router.post(
    "/flag/{flag_id}/triage",
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("flags:write"))],
)
def triage_flag(
    flag_id: int,
    payload: TriageFlagRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
) -> SafetyFlagItem:
    row = db.get(SafetyFlag, flag_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Flag not found")

    row.review_status = payload.review_status
    row.escalation_status = payload.escalation_status
    row.triage_notes = payload.triage_notes or None
    row.reviewed_at = datetime.utcnow()
    row.reviewer_user_id = admin_user.id
    db.add(row)
    if payload.escalation_status in {"escalated", "urgent"}:
        create_safety_escalation_event(
            db,
            user_id=row.user_id,
            escalation_status=payload.escalation_status,
            detail=payload.triage_notes or "Admin escalation",
            safety_flag_id=row.id,
        )
    db.commit()

    return SafetyFlagItem(
        id=row.id,
        user_id=row.user_id,
        trigger_type=row.trigger_type,
        severity_score=row.severity_score,
        escalation_status=row.escalation_status,
        review_status=row.review_status,
        triage_notes=row.triage_notes,
        reviewed_at=row.reviewed_at,
        reviewer_user_id=row.reviewer_user_id,
        created_at=row.created_at,
    )


@router.get(
    "/flags/analytics",
    response_model=SafetyFlagAnalyticsResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("analytics:read"))],
)
def flag_analytics(db: Session = Depends(get_db)) -> SafetyFlagAnalyticsResponse:
    total_flags = int(db.scalar(select(func.count(SafetyFlag.id))) or 0)
    avg_severity = float(db.scalar(select(func.avg(SafetyFlag.severity_score))) or 0.0)

    review_rows = db.execute(
        select(SafetyFlag.review_status, func.count(SafetyFlag.id)).group_by(SafetyFlag.review_status)
    ).all()
    escalation_rows = db.execute(
        select(SafetyFlag.escalation_status, func.count(SafetyFlag.id)).group_by(SafetyFlag.escalation_status)
    ).all()

    by_review_status = [
        SafetyFlagAnalyticsBucket(key=str(status), count=int(count or 0)) for status, count in review_rows
    ]
    by_escalation_status = [
        SafetyFlagAnalyticsBucket(key=str(status), count=int(count or 0))
        for status, count in escalation_rows
    ]

    return SafetyFlagAnalyticsResponse(
        total_flags=total_flags,
        avg_severity=round(avg_severity, 4),
        by_review_status=by_review_status,
        by_escalation_status=by_escalation_status,
    )


@router.get(
    "/queue-health",
    response_model=QueueHealthResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("worker:read"))],
)
def admin_queue_health() -> QueueHealthResponse:
    health = queue_health()
    return QueueHealthResponse(**health)


@router.get(
    "/dead-letter-jobs",
    response_model=list[DeadLetterJobItem],
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:read"))],
)
def admin_dead_letter_jobs(
    limit: int = 50,
    offset: int = 0,
    job_type: str | None = None,
    user_id: str | None = None,
    reason: str | None = None,
) -> list[DeadLetterJobItem]:
    jobs = list_dead_letter_jobs(
        limit=limit,
        offset=offset,
        job_type=job_type,
        user_id=user_id,
        reason=reason,
    )
    response: list[DeadLetterJobItem] = []

    for item in jobs:
        dead_letter_id = str(item.get("dead_letter_id", "")).strip()
        job_type = str(item.get("job_type", "")).strip()
        user_id = str(item.get("user_id", "")).strip()
        if not dead_letter_id or not job_type or not user_id:
            continue

        response.append(
            DeadLetterJobItem(
                dead_letter_id=dead_letter_id,
                job_type=job_type,
                user_id=user_id,
                attempt=int(item.get("attempt", 0) or 0),
                dead_letter_reason=(
                    str(item.get("dead_letter_reason")) if item.get("dead_letter_reason") else None
                ),
                dead_lettered_at=_parse_iso_datetime(item.get("dead_lettered_at")),
                created_at=_parse_iso_datetime(item.get("created_at")),
            )
        )

    return response


@router.get(
    "/dead-letter-summary",
    response_model=DeadLetterSummaryResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:read"))],
)
def admin_dead_letter_summary() -> DeadLetterSummaryResponse:
    summary = summarize_dead_letter_jobs()
    return DeadLetterSummaryResponse(**summary)


@router.get(
    "/notifications",
    response_model=list[NotificationLogItem],
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("notifications:read"))],
)
def admin_notification_logs(
    limit: int = 50,
    offset: int = 0,
    user_id: str | None = None,
    channel: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
) -> list[NotificationLogItem]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    statement = select(NotificationLog)
    if user_id:
        statement = statement.where(NotificationLog.user_id == user_id)
    if channel:
        statement = statement.where(NotificationLog.channel == channel)
    if status:
        statement = statement.where(NotificationLog.status == status)

    rows = db.scalars(
        statement.order_by(NotificationLog.created_at.desc()).offset(safe_offset).limit(safe_limit)
    ).all()
    return [
        NotificationLogItem(
            id=row.id,
            user_id=row.user_id,
            channel=row.channel,
            status=row.status,
            source=row.source,
            message=row.message,
            error_detail=row.error_detail,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post(
    "/notifications/test-send",
    response_model=NotificationSendResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("notifications:write"))],
)
def admin_notification_test_send(
    payload: NotificationSendRequest,
    db: Session = Depends(get_db),
) -> NotificationSendResponse:
    row = send_user_notification(
        db=db,
        user_id=payload.user_id,
        channel=payload.channel,
        message=payload.message,
        source="admin_test_send",
        metadata={"trigger": "admin"},
    )
    db.commit()
    return NotificationSendResponse(id=row.id, status=row.status)


@router.get(
    "/notifications/analytics",
    response_model=NotificationAnalyticsResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("analytics:read"))],
)
def admin_notification_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
) -> NotificationAnalyticsResponse:
    return NotificationAnalyticsResponse(**get_notification_analytics(db, days=days))


@router.get(
    "/notifications/analytics.csv",
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("analytics:read"))],
)
def admin_notification_analytics_csv(
    days: int = 30,
    db: Session = Depends(get_db),
) -> Response:
    analytics = get_notification_analytics(db, days=days)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["scope", "key", "count", "delivered", "failed", "delivery_rate"])
    writer.writerow(
        [
            "summary",
            f"last_{analytics['days']}_days",
            analytics["total_events"],
            analytics["delivered"],
            analytics["failed"],
            analytics["delivery_rate"],
        ]
    )
    for item in analytics["by_status"]:
        writer.writerow(["status", item["key"], item["count"], "", "", ""])
    for item in analytics["by_source"]:
        writer.writerow(["source", item["key"], item["count"], "", "", ""])
    for item in analytics["by_channel"]:
        writer.writerow(
            [
                "channel",
                item["channel"],
                item["total"],
                item["delivered"],
                item["failed"],
                item["delivery_rate"],
            ]
        )
    for item in analytics["by_day"]:
        writer.writerow(["day", item["key"], item["count"], "", "", ""])
    for item in analytics["failure_reasons"]:
        writer.writerow(["failure_reason", item["key"], item["count"], "", "", ""])

    csv_data = output.getvalue()
    output.close()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=notification_analytics_{analytics['days']}d.csv"
        },
    )


def _record_dead_letter_replay_audit(
    db: Session,
    *,
    dead_letter_id: str,
    job: dict[str, object],
    admin_user_id: str,
    replay_status: str,
) -> None:
    audit_row = DeadLetterReplayAudit(
        dead_letter_id=dead_letter_id,
        job_type=str(job.get("job_type") or "unknown"),
        job_user_id=str(job.get("user_id") or "unknown"),
        admin_user_id=admin_user_id,
        replay_status=replay_status,
        replayed_at=datetime.utcnow(),
    )
    db.add(audit_row)


@router.post(
    "/dead-letter-jobs/{dead_letter_id}/replay",
    response_model=DeadLetterReplayResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:write"))],
)
def admin_replay_dead_letter_job(
    dead_letter_id: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
) -> DeadLetterReplayResponse:
    existing_job = get_dead_letter_job(dead_letter_id)
    replayed_job = replay_dead_letter_job(dead_letter_id)

    replay_status = "replayed" if replayed_job is not None else "failed"
    reference_job = replayed_job or existing_job or {}

    _record_dead_letter_replay_audit(
        db,
        dead_letter_id=dead_letter_id,
        job=reference_job,
        admin_user_id=admin_user.id,
        replay_status=replay_status,
    )
    db.commit()

    if replayed_job is None:
        raise HTTPException(status_code=404, detail="Dead-letter job not found or replay failed")

    return DeadLetterReplayResponse(status="replayed", dead_letter_id=dead_letter_id)


@router.post(
    "/dead-letter-jobs/{dead_letter_id}/drop",
    response_model=DeadLetterDropResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:write"))],
)
def admin_drop_dead_letter_job(
    dead_letter_id: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
) -> DeadLetterDropResponse:
    dropped_job = drop_dead_letter_job(dead_letter_id)
    if dropped_job is None:
        _record_dead_letter_replay_audit(
            db,
            dead_letter_id=dead_letter_id,
            job={"job_type": "unknown", "user_id": "unknown"},
            admin_user_id=admin_user.id,
            replay_status="drop_failed",
        )
        db.commit()
        raise HTTPException(status_code=404, detail="Dead-letter job not found or drop failed")

    _record_dead_letter_replay_audit(
        db,
        dead_letter_id=dead_letter_id,
        job=dropped_job,
        admin_user_id=admin_user.id,
        replay_status="dropped",
    )
    db.commit()
    return DeadLetterDropResponse(status="dropped", dead_letter_id=dead_letter_id)


@router.post(
    "/dead-letter-jobs/drop-bulk",
    response_model=DeadLetterBulkDropResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:write"))],
)
def admin_drop_dead_letter_jobs_bulk(
    payload: DeadLetterBulkDropRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
) -> DeadLetterBulkDropResponse:
    normalized_ids = [value.strip() for value in payload.dead_letter_ids if value.strip()]
    if not normalized_ids:
        raise HTTPException(status_code=400, detail="No valid dead_letter_ids provided")

    seen_ids = set()
    unique_ids = []
    for dead_letter_id in normalized_ids:
        if dead_letter_id in seen_ids:
            continue
        seen_ids.add(dead_letter_id)
        unique_ids.append(dead_letter_id)

    dropped_ids, failed_ids, dropped_payloads = drop_dead_letter_jobs(unique_ids)
    dropped_set = set(dropped_ids)
    for dead_letter_id in unique_ids:
        status = "dropped" if dead_letter_id in dropped_set else "drop_failed"
        reference_job = dropped_payloads.get(dead_letter_id, {"job_type": "unknown", "user_id": "unknown"})
        _record_dead_letter_replay_audit(
            db,
            dead_letter_id=dead_letter_id,
            job=reference_job,
            admin_user_id=admin_user.id,
            replay_status=status,
        )

    db.commit()
    return DeadLetterBulkDropResponse(dropped_ids=dropped_ids, failed_ids=failed_ids)


@router.post(
    "/dead-letter-jobs/purge",
    response_model=DeadLetterPurgeResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("maintenance:write"))],
)
def admin_purge_dead_letter_jobs(
    payload: DeadLetterPurgeRequest,
    db: Session = Depends(get_db),
) -> DeadLetterPurgeResponse:
    purged_ids = purge_dead_letter_jobs(
        older_than_days=payload.older_than_days,
        job_type=payload.job_type,
        user_id=payload.user_id,
        reason_contains=payload.reason_contains,
        limit=payload.limit,
    )

    purged_audit_count = 0
    if payload.include_replay_audits and purged_ids:
        result = db.execute(
            delete(DeadLetterReplayAudit).where(DeadLetterReplayAudit.dead_letter_id.in_(purged_ids))
        )
        purged_audit_count = int(result.rowcount or 0)
        db.commit()

    return DeadLetterPurgeResponse(
        purged_dead_letter_ids=purged_ids,
        purged_dead_letter_count=len(purged_ids),
        purged_replay_audit_count=purged_audit_count,
    )


@router.post(
    "/dead-letter-jobs/replay-bulk",
    response_model=DeadLetterBulkReplayResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:write"))],
)
def admin_replay_dead_letter_jobs_bulk(
    payload: DeadLetterBulkReplayRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
) -> DeadLetterBulkReplayResponse:
    normalized_ids = [value.strip() for value in payload.dead_letter_ids if value.strip()]
    if not normalized_ids:
        raise HTTPException(status_code=400, detail="No valid dead_letter_ids provided")

    seen_ids = set()
    unique_ids = []
    for dead_letter_id in normalized_ids:
        if dead_letter_id in seen_ids:
            continue
        seen_ids.add(dead_letter_id)
        unique_ids.append(dead_letter_id)

    existing_jobs = {
        dead_letter_id: (get_dead_letter_job(dead_letter_id) or {"job_type": "unknown", "user_id": "unknown"})
        for dead_letter_id in unique_ids
    }

    replayed_ids, failed_ids = replay_dead_letter_jobs(unique_ids)

    replayed_set = set(replayed_ids)
    for dead_letter_id in unique_ids:
        status = "replayed" if dead_letter_id in replayed_set else "failed"
        reference_job = existing_jobs.get(dead_letter_id, {"job_type": "unknown", "user_id": "unknown"})
        _record_dead_letter_replay_audit(
            db,
            dead_letter_id=dead_letter_id,
            job=reference_job,
            admin_user_id=admin_user.id,
            replay_status=status,
        )

    db.commit()
    return DeadLetterBulkReplayResponse(replayed_ids=replayed_ids, failed_ids=failed_ids)


@router.get(
    "/dead-letter-replays",
    response_model=list[DeadLetterReplayAuditItem],
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:read"))],
)
def admin_dead_letter_replays(limit: int = 50, db: Session = Depends(get_db)) -> list[DeadLetterReplayAuditItem]:
    return _admin_dead_letter_replays_filtered(limit=limit, offset=0, db=db)


def _admin_dead_letter_replays_filtered(
    limit: int,
    offset: int,
    db: Session,
    replay_status: str | None = None,
    admin_user_id: str | None = None,
    job_user_id: str | None = None,
    dead_letter_id: str | None = None,
) -> list[DeadLetterReplayAuditItem]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)

    statement = select(DeadLetterReplayAudit)
    if replay_status:
        statement = statement.where(DeadLetterReplayAudit.replay_status == replay_status)
    if admin_user_id:
        statement = statement.where(DeadLetterReplayAudit.admin_user_id == admin_user_id)
    if job_user_id:
        statement = statement.where(DeadLetterReplayAudit.job_user_id == job_user_id)
    if dead_letter_id:
        statement = statement.where(DeadLetterReplayAudit.dead_letter_id == dead_letter_id)

    statement = statement.order_by(DeadLetterReplayAudit.replayed_at.desc()).offset(safe_offset).limit(safe_limit)
    rows = db.scalars(statement).all()

    return [
        DeadLetterReplayAuditItem(
            id=row.id,
            dead_letter_id=row.dead_letter_id,
            job_type=row.job_type,
            job_user_id=row.job_user_id,
            admin_user_id=row.admin_user_id,
            replay_status=row.replay_status,
            replayed_at=row.replayed_at,
        )
        for row in rows
    ]


@router.get(
    "/dead-letter-replays/filter",
    response_model=list[DeadLetterReplayAuditItem],
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:read"))],
)
def admin_dead_letter_replays_filtered(
    limit: int = 50,
    offset: int = 0,
    replay_status: str | None = None,
    admin_user_id: str | None = None,
    job_user_id: str | None = None,
    dead_letter_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[DeadLetterReplayAuditItem]:
    return _admin_dead_letter_replays_filtered(
        limit=limit,
        offset=offset,
        replay_status=replay_status,
        admin_user_id=admin_user_id,
        job_user_id=job_user_id,
        dead_letter_id=dead_letter_id,
        db=db,
    )


@router.get(
    "/dead-letter-replays.csv",
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("dead_letter:read"))],
)
def admin_dead_letter_replays_csv(limit: int = 100, db: Session = Depends(get_db)) -> Response:
    rows = admin_dead_letter_replays(limit=limit, db=db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "dead_letter_id",
            "job_type",
            "job_user_id",
            "admin_user_id",
            "replay_status",
            "replayed_at",
        ]
    )
    for item in rows:
        writer.writerow(
            [
                item.id,
                item.dead_letter_id,
                item.job_type,
                item.job_user_id,
                item.admin_user_id,
                item.replay_status,
                item.replayed_at.isoformat(),
            ]
        )

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="path101_dead_letter_replays.csv"'},
    )


@router.get(
    "/worker-events",
    response_model=list[WorkerEventItem],
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("worker:read"))],
)
def admin_worker_events(limit: int = 25, db: Session = Depends(get_db)) -> list[WorkerEventItem]:
    safe_limit = max(1, min(limit, 200))
    statement = select(BanditLog).order_by(BanditLog.timestamp.desc()).limit(safe_limit)
    rows = db.scalars(statement).all()

    response: list[WorkerEventItem] = []
    for row in rows:
        context_source = ""
        if isinstance(row.context_json, dict):
            context_source = str(row.context_json.get("source", ""))

        source = context_source or "unknown"
        if source not in {"worker_queue", "scheduler_nudge"}:
            continue

        response.append(
            WorkerEventItem(
                id=row.id,
                user_id=row.user_id,
                action_id=row.action_id,
                reward=row.reward,
                source=source,
                timestamp=row.timestamp,
            )
        )

    return response


@router.post(
    "/scheduler/tick",
    response_model=SchedulerTickResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("scheduler:run"))],
)
def admin_scheduler_tick() -> SchedulerTickResponse:
    result = run_scheduler_tick()
    return SchedulerTickResponse(**result)


@router.get(
    "/worker-metrics",
    response_model=WorkerMetricsResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("worker:read"))],
)
def admin_worker_metrics(hours: int = 24, db: Session = Depends(get_db)) -> WorkerMetricsResponse:
    safe_hours = max(1, min(hours, 24 * 30))
    cutoff = datetime.utcnow() - timedelta(hours=safe_hours)

    grouped_rows = db.execute(
        select(WorkerMetric.metric_type, func.count(WorkerMetric.id))
        .where(WorkerMetric.created_at >= cutoff)
        .group_by(WorkerMetric.metric_type)
    ).all()

    by_metric_type = [
        WorkerMetricItem(metric_type=str(metric_type), count=int(count or 0))
        for metric_type, count in grouped_rows
    ]
    total_events = sum(item.count for item in by_metric_type)
    total_failures = sum(
        item.count for item in by_metric_type if item.metric_type in {"job_failed", "job_dead_lettered"}
    )
    failure_rate = (total_failures / total_events) if total_events > 0 else 0.0

    return WorkerMetricsResponse(
        hours=safe_hours,
        total_events=total_events,
        total_failures=total_failures,
        failure_rate=round(failure_rate, 6),
        alert_triggered=failure_rate >= WORKER_ALERT_FAILURE_RATE,
        by_metric_type=by_metric_type,
    )


@router.get(
    "/safety-escalations",
    response_model=list[SafetyEscalationEventItem],
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("flags:read"))],
)
def admin_safety_escalations(limit: int = 100, db: Session = Depends(get_db)) -> list[SafetyEscalationEventItem]:
    safe_limit = max(1, min(limit, 500))
    rows = db.scalars(
        select(SafetyEscalationEvent)
        .order_by(SafetyEscalationEvent.created_at.desc())
        .limit(safe_limit)
    ).all()
    return [
        SafetyEscalationEventItem(
            id=row.id,
            safety_flag_id=row.safety_flag_id,
            user_id=row.user_id,
            escalation_status=row.escalation_status,
            channel=row.channel,
            status=row.status,
            detail=row.detail,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post(
    "/maintenance/retention",
    response_model=RetentionMaintenanceResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("maintenance:write"))],
)
def admin_maintenance_retention(
    payload: RetentionMaintenanceRequest,
    db: Session = Depends(get_db),
) -> RetentionMaintenanceResponse:
    cutoff = datetime.utcnow() - timedelta(days=payload.older_than_days)

    notifications_anonymized = 0
    flags_anonymized = 0
    bandit_logs_deleted = 0

    if payload.anonymize_notifications:
        notification_rows = db.scalars(
            select(NotificationLog).where(NotificationLog.created_at < cutoff)
        ).all()
        for row in notification_rows:
            row.user_id = "anonymized"
            db.add(row)
            notifications_anonymized += 1

    if payload.anonymize_flags:
        flag_rows = db.scalars(select(SafetyFlag).where(SafetyFlag.created_at < cutoff)).all()
        for row in flag_rows:
            row.user_id = "anonymized"
            row.raw_text_encrypted = "[redacted]"
            db.add(row)
            flags_anonymized += 1

    if payload.delete_old_bandit_logs:
        result = db.execute(delete(BanditLog).where(BanditLog.timestamp < cutoff))
        bandit_logs_deleted = int(result.rowcount or 0)

    record_worker_metric(
        db,
        metric_type="maintenance_retention_run",
        value=1.0,
        detail=f"days={payload.older_than_days}",
    )

    db.commit()
    return RetentionMaintenanceResponse(
        notifications_anonymized=notifications_anonymized,
        flags_anonymized=flags_anonymized,
        bandit_logs_deleted=bandit_logs_deleted,
    )


@router.get(
    "/analytics/actions",
    response_model=BanditAnalyticsResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("analytics:read"))],
)
def admin_action_analytics(
    days: int = 30,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> BanditAnalyticsResponse:
    safe_days = max(1, min(days, 365))
    safe_limit = max(1, min(limit, 50))
    cutoff = datetime.utcnow() - timedelta(days=safe_days)

    total_statement = select(func.count(BanditLog.id)).where(BanditLog.timestamp >= cutoff)
    total_events = int(db.scalar(total_statement) or 0)

    action_statement = (
        select(
            BanditLog.action_id,
            func.count(BanditLog.id),
            func.avg(BanditLog.reward),
            func.max(BanditLog.timestamp),
        )
        .where(BanditLog.timestamp >= cutoff)
        .group_by(BanditLog.action_id)
        .order_by(func.avg(BanditLog.reward).desc(), func.count(BanditLog.id).desc())
        .limit(safe_limit)
    )

    actions: list[ActionAnalyticsItem] = []
    for action_id, count, avg_reward, last_seen in db.execute(action_statement).all():
        if not isinstance(action_id, str) or last_seen is None:
            continue

        actions.append(
            ActionAnalyticsItem(
                action_id=action_id,
                count=int(count or 0),
                avg_reward=float(avg_reward or 0.0),
                last_seen=last_seen,
            )
        )

    return BanditAnalyticsResponse(days=safe_days, total_events=total_events, actions=actions)


@router.get(
    "/analytics/actions.csv",
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("analytics:read"))],
)
def admin_action_analytics_csv(
    days: int = 30,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> Response:
    result = admin_action_analytics(days=days, limit=limit, db=db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["days", "total_events", "action_id", "count", "avg_reward", "last_seen"])
    for item in result.actions:
        writer.writerow(
            [
                result.days,
                result.total_events,
                item.action_id,
                item.count,
                f"{item.avg_reward:.6f}",
                item.last_seen.isoformat(),
            ]
        )

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="path101_action_analytics_{result.days}d.csv"'},
    )


def _compute_reward_trend(rewards: list[float]) -> str:
    if len(rewards) < 4:
        return "insufficient"

    midpoint = len(rewards) // 2
    first_half = rewards[:midpoint]
    second_half = rewards[midpoint:]
    if not first_half or not second_half:
        return "insufficient"

    first_avg = sum(first_half) / len(first_half)
    second_avg = sum(second_half) / len(second_half)
    delta = second_avg - first_avg
    if delta > 0.05:
        return "up"
    if delta < -0.05:
        return "down"
    return "flat"


@router.get(
    "/analytics/users",
    response_model=UserAnalyticsResponse,
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("analytics:read"))],
)
def admin_user_analytics(
    days: int = 30,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> UserAnalyticsResponse:
    safe_days = max(1, min(days, 365))
    safe_limit = max(1, min(limit, 100))
    cutoff = datetime.utcnow() - timedelta(days=safe_days)

    sessions_statement = (
        select(
            SessionRecord.user_id,
            func.count(SessionRecord.id),
            func.sum(case((SessionRecord.completed_bool.is_(True), 1), else_=0)),
        )
        .join(Plan, SessionRecord.plan_id == Plan.id)
        .where(Plan.start_date >= cutoff)
        .group_by(SessionRecord.user_id)
    )

    session_stats: dict[str, tuple[int, int]] = {}
    for user_id, total_count, completed_count in db.execute(sessions_statement).all():
        if not isinstance(user_id, str):
            continue
        session_stats[user_id] = (int(total_count or 0), int(completed_count or 0))

    rewards_statement = (
        select(BanditLog.user_id, BanditLog.reward, BanditLog.timestamp)
        .where(BanditLog.timestamp >= cutoff)
        .order_by(BanditLog.user_id.asc(), BanditLog.timestamp.asc())
    )

    reward_series: dict[str, list[float]] = {}
    last_activity: dict[str, datetime] = {}
    for user_id, reward, timestamp in db.execute(rewards_statement).all():
        if not isinstance(user_id, str) or timestamp is None:
            continue

        reward_series.setdefault(user_id, []).append(float(reward or 0.0))
        last_activity[user_id] = timestamp

    user_ids = set(session_stats.keys()) | set(reward_series.keys())
    rows: list[UserAnalyticsItem] = []
    for user_id in user_ids:
        sessions_total, sessions_completed = session_stats.get(user_id, (0, 0))
        completion_rate = (sessions_completed / sessions_total) if sessions_total > 0 else 0.0

        rewards = reward_series.get(user_id, [])
        avg_reward = (sum(rewards) / len(rewards)) if rewards else 0.0
        trend = _compute_reward_trend(rewards)

        rows.append(
            UserAnalyticsItem(
                user_id=user_id,
                sessions_total=sessions_total,
                sessions_completed=sessions_completed,
                completion_rate=completion_rate,
                avg_reward=avg_reward,
                reward_trend=trend,
                last_activity=last_activity.get(user_id),
            )
        )

    rows.sort(key=lambda item: (item.completion_rate, item.avg_reward, item.sessions_total), reverse=True)
    rows = rows[:safe_limit]

    return UserAnalyticsResponse(days=safe_days, total_users=len(rows), users=rows)


@router.get(
    "/analytics/users.csv",
    dependencies=[Depends(admin_rate_limit), Depends(require_admin_permission("analytics:read"))],
)
def admin_user_analytics_csv(
    days: int = 30,
    limit: int = 20,
    db: Session = Depends(get_db),
) -> Response:
    result = admin_user_analytics(days=days, limit=limit, db=db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "days",
            "total_users",
            "user_id",
            "sessions_total",
            "sessions_completed",
            "completion_rate",
            "avg_reward",
            "reward_trend",
            "last_activity",
        ]
    )
    for item in result.users:
        writer.writerow(
            [
                result.days,
                result.total_users,
                item.user_id,
                item.sessions_total,
                item.sessions_completed,
                f"{item.completion_rate:.6f}",
                f"{item.avg_reward:.6f}",
                item.reward_trend,
                item.last_activity.isoformat() if item.last_activity else "",
            ]
        )

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="path101_user_analytics_{result.days}d.csv"'},
    )
