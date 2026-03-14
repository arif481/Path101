from __future__ import annotations

import random
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import BANDIT_EPSILON, BANDIT_MIN_HISTORY
from app.models.db_models import BanditLog
from app.schemas import SessionPlan


@dataclass(frozen=True)
class ActionCandidate:
    action_id: str
    plan: SessionPlan
    rationale: str


def _build_candidates(base_session_id: str) -> list[ActionCandidate]:
    return [
        ActionCandidate(
            action_id="recovery_10",
            plan=SessionPlan.model_validate(
                {
                    "session_id": f"{base_session_id}_recovery_10",
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
            ),
            rationale="Short step prioritized to reduce friction and protect consistency.",
        ),
        ActionCandidate(
            action_id="focus_15",
            plan=SessionPlan.model_validate(
                {
                    "session_id": f"{base_session_id}_focus_15",
                    "title": "Focus sprint",
                    "duration_mins": 15,
                    "steps": [
                        {"title": "3-minute setup", "duration_mins": 3},
                        {"title": "12-minute focused sprint", "duration_mins": 12},
                    ],
                    "expected_metrics": ["completion", "mood_change"],
                    "difficulty": "medium",
                    "scheduled_at": None,
                }
            ),
            rationale="Moderate sprint chosen for momentum when baseline stability is acceptable.",
        ),
        ActionCandidate(
            action_id="deep_20",
            plan=SessionPlan.model_validate(
                {
                    "session_id": f"{base_session_id}_deep_20",
                    "title": "Deep practice block",
                    "duration_mins": 20,
                    "steps": [
                        {"title": "4-minute setup", "duration_mins": 4},
                        {"title": "16-minute deep work", "duration_mins": 16},
                    ],
                    "expected_metrics": ["completion", "mood_change"],
                    "difficulty": "high",
                    "scheduled_at": None,
                }
            ),
            rationale="Longer block selected to maximize gains when recent outcomes support challenge.",
        ),
    ]


def _get_history_stats(db: Session, user_id: str) -> dict[str, tuple[float, int]]:
    statement = (
        select(BanditLog.action_id, func.avg(BanditLog.reward), func.count(BanditLog.id))
        .where(BanditLog.user_id == user_id)
        .group_by(BanditLog.action_id)
    )

    stats: dict[str, tuple[float, int]] = {}
    for action_id, avg_reward, count in db.execute(statement).all():
        if not isinstance(action_id, str):
            continue

        stats[action_id] = (float(avg_reward or 0.0), int(count or 0))

    return stats


def select_next_recommendation(
    db: Session,
    user_id: str,
    base_session_id: str,
    feedback: str,
) -> tuple[SessionPlan, str, str, str]:
    candidates = _build_candidates(base_session_id)

    lowered_feedback = feedback.strip().lower()
    if any(token in lowered_feedback for token in {"tired", "overwhelmed", "anxious", "exhausted"}):
        candidate = candidates[0]
        return (
            candidate.plan,
            candidate.action_id,
            "Feedback indicates high strain, so a lower-intensity recommendation was selected.",
            "v1-feedback-guardrail",
        )

    stats = _get_history_stats(db, user_id)
    sampled = [(candidate, *stats.get(candidate.action_id, (0.0, 0))) for candidate in candidates]

    under_sampled = [item for item in sampled if item[2] < BANDIT_MIN_HISTORY]
    if under_sampled:
        candidate, _, _ = min(under_sampled, key=lambda item: item[2])
        return (
            candidate.plan,
            candidate.action_id,
            "Insufficient history detected, so the least-sampled action was explored.",
            "v1-cold-start",
        )

    epsilon = BANDIT_EPSILON
    if random.random() < epsilon:
        candidate, _, _ = random.choice(sampled)
        return (
            candidate.plan,
            candidate.action_id,
            f"Exploration branch selected with epsilon={epsilon:.2f}.",
            "v1-epsilon-explore",
        )

    candidate, avg_reward, _ = max(sampled, key=lambda item: item[1])
    return (
        candidate.plan,
        candidate.action_id,
        f"Exploitation branch selected highest historical reward estimate ({avg_reward:.2f}).",
        "v1-epsilon-exploit",
    )
