from app.services.safety_triage import evaluate_safety_text


def test_evaluate_safety_text_urgent() -> None:
    result = evaluate_safety_text("I want to kill myself and end my life")

    assert result["triggered"] is True
    assert result["severity_score"] >= 70
    assert result["escalation_status"] == "urgent"
    assert result["trigger_type"] == "crisis_language"


def test_evaluate_safety_text_watch() -> None:
    result = evaluate_safety_text("I feel hopeless and panic about everything")

    assert result["triggered"] is True
    assert 20 <= int(result["severity_score"]) < 70
    assert result["escalation_status"] in {"watch", "escalated"}


def test_evaluate_safety_text_non_triggering() -> None:
    result = evaluate_safety_text("I want to improve focus for exams")

    assert result["triggered"] is False
    assert result["severity_score"] == 0
    assert result["escalation_status"] == "none"
