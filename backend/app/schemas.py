from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class IntakeRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=5, max_length=1200)
    available_times: list[str] = Field(default_factory=list)
    preferences: dict[str, Any] = Field(default_factory=dict)


class SessionStep(BaseModel):
    title: str
    duration_mins: int


class SessionPlan(BaseModel):
    session_id: str
    title: str
    duration_mins: int
    steps: list[SessionStep]
    expected_metrics: list[str]
    difficulty: Literal["low", "medium", "high"]
    scheduled_at: datetime | None = None


class PlanPreview(BaseModel):
    plan_id: str
    user_id: str
    current_week: int
    duration_weeks: int
    modules: list[str]
    next_session: SessionPlan
    suggested_calendar_times: list[str]


class IntakeResponse(BaseModel):
    plan_preview: PlanPreview
    smart_goal: str
    safety_triggered: bool = False
    triage_message: str | None = None


class PlanResponse(BaseModel):
    current_week: int
    next_session: SessionPlan


class SessionCompleteRequest(BaseModel):
    pre_mood: int = Field(..., ge=1, le=10)
    post_mood: int = Field(..., ge=1, le=10)
    feedback: str = Field(default="", max_length=1000)


class SessionCompleteResponse(BaseModel):
    next_recommendation: SessionPlan
    reward: float
    rationale: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    anonymous: bool
    is_admin: bool = False


class AnonymousAuthResponse(AuthTokenResponse):
    anon_id: str


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class MeResponse(BaseModel):
    user_id: str
    anonymous: bool
    is_admin: bool
    created_at: datetime


class SafetyFlagItem(BaseModel):
    id: int
    user_id: str
    trigger_type: str
    review_status: str
    created_at: datetime


class ResolveFlagRequest(BaseModel):
    review_status: Literal["resolved", "dismissed"]


class QueueHealthResponse(BaseModel):
    connected: bool
    queue_size: int
    dead_letter_size: int


class DeadLetterJobItem(BaseModel):
    dead_letter_id: str
    job_type: str
    user_id: str
    attempt: int
    dead_letter_reason: str | None = None
    dead_lettered_at: datetime | None = None
    created_at: datetime | None = None


class DeadLetterReplayResponse(BaseModel):
    status: Literal["replayed"]
    dead_letter_id: str


class DeadLetterReplayAuditItem(BaseModel):
    id: int
    dead_letter_id: str
    job_type: str
    job_user_id: str
    admin_user_id: str
    replay_status: str
    replayed_at: datetime


class WorkerEventItem(BaseModel):
    id: int
    user_id: str
    action_id: str
    reward: float
    source: str
    timestamp: datetime


class SchedulerTickResponse(BaseModel):
    scanned_sessions: int
    acquired_locks: int
    enqueued_jobs: int


class ActionAnalyticsItem(BaseModel):
    action_id: str
    count: int
    avg_reward: float
    last_seen: datetime


class BanditAnalyticsResponse(BaseModel):
    days: int
    total_events: int
    actions: list[ActionAnalyticsItem]


class UserAnalyticsItem(BaseModel):
    user_id: str
    sessions_total: int
    sessions_completed: int
    completion_rate: float
    avg_reward: float
    reward_trend: Literal["up", "down", "flat", "insufficient"]
    last_activity: datetime | None


class UserAnalyticsResponse(BaseModel):
    days: int
    total_users: int
    users: list[UserAnalyticsItem]
