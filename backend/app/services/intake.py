from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.schemas import PlanPreview, SessionPlan, SessionStep


KEYWORD_LABELS: dict[str, list[str]] = {
    "procrastination": ["delay", "procrast", "later", "avoid", "starting", "assignment"],
    "anxiety": ["anxious", "worry", "panic", "nervous"],
    "insomnia": ["sleep", "insomnia", "awake", "tired", "fatigue"],
    "low_mood": ["sad", "low mood", "hopeless", "empty", "down"],
    "exam_stress": ["exam", "test", "study", "grade"],
}

CRISIS_PATTERNS = [
    r"suicid",
    r"kill myself",
    r"end my life",
    r"self harm",
    r"hurt myself",
]


MODULE_LIBRARY: dict[str, dict] = {
    "procrastination_starter": {
        "targets": ["procrastination", "exam_stress"],
        "bct_tags": ["1.1", "1.4", "7.1", "8.3", "8.7"],
        "weeks": 2,
    },
    "anxiety_downshift": {
        "targets": ["anxiety", "exam_stress"],
        "bct_tags": ["1.2", "1.4", "11.2", "15.1"],
        "weeks": 2,
    },
    "sleep_reset": {
        "targets": ["insomnia"],
        "bct_tags": ["1.4", "7.1", "8.2", "8.3"],
        "weeks": 2,
    },
    "mood_activation": {
        "targets": ["low_mood"],
        "bct_tags": ["1.1", "1.4", "8.7", "15.1"],
        "weeks": 2,
    },
}


def normalize_text(text: str) -> str:
    cleaned = text.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def detect_crisis_language(text: str) -> bool:
    lowered = normalize_text(text)
    return any(re.search(pattern, lowered) for pattern in CRISIS_PATTERNS)


def classify_intents(text: str) -> list[str]:
    normalized = normalize_text(text)
    scores: dict[str, int] = defaultdict(int)

    for label, keywords in KEYWORD_LABELS.items():
        for keyword in keywords:
            if keyword in normalized:
                scores[label] += 1

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    labels = [name for name, score in ranked if score > 0]
    return labels or ["procrastination"]


def build_smart_goal(raw_text: str, available_times: list[str]) -> str:
    normalized = normalize_text(raw_text)

    if "2 hours" in normalized or "two hours" in normalized:
        base = "Complete two 25-minute focused sessions"
    elif "1 hour" in normalized or "one hour" in normalized:
        base = "Complete one 25-minute focused session"
    else:
        base = "Complete one 10-minute starter session"

    when = "this week"
    if available_times:
        when = f"during {available_times[0]} this week"

    return f"{base} Mon-Fri {when}."


def choose_modules(labels: list[str]) -> list[str]:
    selected: list[str] = []
    for module_id, module in MODULE_LIBRARY.items():
        if any(label in module["targets"] for label in labels):
            selected.append(module_id)

    if not selected:
        selected.append("procrastination_starter")

    return selected[:2]


def build_initial_session(labels: list[str], available_times: list[str]) -> SessionPlan:
    scheduled_at = None
    if available_times:
        scheduled_at = datetime.now(timezone.utc) + timedelta(days=1)

    if "insomnia" in labels:
        title = "Sleep Wind-Down Starter"
        steps = [
            SessionStep(title="Set tomorrow wake time", duration_mins=2),
            SessionStep(title="5-minute breathing reset", duration_mins=5),
            SessionStep(title="Screen-off cue setup", duration_mins=3),
        ]
        duration = 10
    elif "anxiety" in labels:
        title = "Calm + Focus Starter"
        steps = [
            SessionStep(title="Name top worry", duration_mins=2),
            SessionStep(title="5-minute paced breathing", duration_mins=5),
            SessionStep(title="10-minute focused task", duration_mins=10),
        ]
        duration = 17
    else:
        title = "Procrastination Starter"
        steps = [
            SessionStep(title="Environment checklist", duration_mins=2),
            SessionStep(title="10-minute starter focus", duration_mins=10),
            SessionStep(title="Quick reflection", duration_mins=2),
        ]
        duration = 14

    return SessionPlan(
        session_id=f"sess_{uuid4().hex[:10]}",
        title=title,
        duration_mins=duration,
        steps=steps,
        expected_metrics=["completion", "mood_change"],
        difficulty="low",
        scheduled_at=scheduled_at,
    )


def compile_plan(user_id: str, raw_text: str, available_times: list[str]) -> tuple[PlanPreview, str]:
    labels = classify_intents(raw_text)
    smart_goal = build_smart_goal(raw_text, available_times)
    modules = choose_modules(labels)
    next_session = build_initial_session(labels, available_times)

    plan = PlanPreview(
        plan_id=f"plan_{uuid4().hex[:10]}",
        user_id=user_id,
        current_week=1,
        duration_weeks=2,
        modules=modules,
        next_session=next_session,
        suggested_calendar_times=available_times[:3],
    )
    return plan, smart_goal


def compute_reward(pre_mood: int, post_mood: int, returned_24h: bool) -> float:
    completion_reward = 1.0
    mood_delta = max(0.0, min(3.0, float(post_mood - pre_mood))) / 3.0
    followup = 1.0 if returned_24h else 0.0
    reward = 0.6 * completion_reward + 0.3 * mood_delta + 0.1 * followup
    return round(reward, 4)
