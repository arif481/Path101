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
