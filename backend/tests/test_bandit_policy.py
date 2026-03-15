from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.models.db_models import BanditLog
from app.services.bandit_policy import select_next_recommendation


def _session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return factory()


def test_feedback_guardrail_selects_low_intensity_action() -> None:
    db = _session()
    try:
        plan, action_id, rationale, policy_version = select_next_recommendation(
            db=db,
            user_id="user_guardrail",
            base_session_id="session_1",
            feedback="I felt very tired and overwhelmed",
        )
        assert action_id == "recovery_10"
        assert plan.duration_mins == 10
        assert policy_version == "v1-feedback-guardrail"
        assert "lower-intensity" in rationale
    finally:
        db.close()


def test_exploit_prefers_higher_reward_action_from_history() -> None:
    db = _session()
    try:
        db.add_all(
            [
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="recovery_10",
                    policy_version="test",
                    reward=0.2,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="recovery_10",
                    policy_version="test",
                    reward=0.3,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="recovery_10",
                    policy_version="test",
                    reward=0.4,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="focus_15",
                    policy_version="test",
                    reward=0.8,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="focus_15",
                    policy_version="test",
                    reward=0.9,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="focus_15",
                    policy_version="test",
                    reward=1.0,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="deep_20",
                    policy_version="test",
                    reward=0.5,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="deep_20",
                    policy_version="test",
                    reward=0.6,
                    timestamp=datetime.utcnow(),
                ),
                BanditLog(
                    user_id="user_hist",
                    context_json={"source": "test"},
                    action_id="deep_20",
                    policy_version="test",
                    reward=0.7,
                    timestamp=datetime.utcnow(),
                ),
            ]
        )
        db.commit()

        plan, action_id, _, policy_version = select_next_recommendation(
            db=db,
            user_id="user_hist",
            base_session_id="session_2",
            feedback="doing okay",
        )

        assert plan.title in {"Recovery micro-step", "Focus sprint", "Deep practice block"}
        assert action_id in {"recovery_10", "focus_15", "deep_20"}
        assert policy_version.startswith("v1-epsilon-")
    finally:
        db.close()
