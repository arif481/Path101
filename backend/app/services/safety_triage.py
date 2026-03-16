from __future__ import annotations

import re

CRITICAL_PATTERNS = [
    r"suicid",
    r"kill myself",
    r"end my life",
    r"self harm",
    r"hurt myself",
]

HIGH_RISK_PATTERNS = [
    r"can't go on",
    r"no point living",
    r"want to disappear",
    r"overdose",
    r"die",
]

MODERATE_RISK_PATTERNS = [
    r"hopeless",
    r"panic",
    r"severe anxiety",
    r"breakdown",
]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _count_matches(text: str, patterns: list[str]) -> int:
    return sum(1 for pattern in patterns if re.search(pattern, text))


def evaluate_safety_text(text: str) -> dict[str, object]:
    normalized = _normalize(text)

    critical_hits = _count_matches(normalized, CRITICAL_PATTERNS)
    high_hits = _count_matches(normalized, HIGH_RISK_PATTERNS)
    moderate_hits = _count_matches(normalized, MODERATE_RISK_PATTERNS)

    score = critical_hits * 45 + high_hits * 25 + moderate_hits * 12
    severity_score = max(0, min(100, score))

    if severity_score >= 70:
        escalation_status = "urgent"
        trigger_type = "crisis_language"
        triage_message = (
            "Immediate support recommended. If you may be in immediate danger, contact local emergency services now."
        )
    elif severity_score >= 40:
        escalation_status = "escalated"
        trigger_type = "high_risk_language"
        triage_message = (
            "High-risk language detected. A support follow-up should be prioritized by the care/admin team."
        )
    elif severity_score >= 20:
        escalation_status = "watch"
        trigger_type = "moderate_risk_language"
        triage_message = (
            "Possible distress detected. Continue with support tools and consider human check-in if symptoms increase."
        )
    else:
        escalation_status = "none"
        trigger_type = "none"
        triage_message = ""

    return {
        "severity_score": severity_score,
        "escalation_status": escalation_status,
        "trigger_type": trigger_type,
        "triage_message": triage_message,
        "triggered": severity_score >= 20,
    }
