export type IntakeRequest = {
  user_id: string;
  text: string;
  available_times: string[];
  preferences: Record<string, unknown>;
};

export type SessionStep = {
  title: string;
  duration_mins: number;
};

export type SessionPlan = {
  session_id: string;
  title: string;
  duration_mins: number;
  steps: SessionStep[];
  expected_metrics: string[];
  difficulty: "low" | "medium" | "high";
  scheduled_at: string | null;
};

export type PlanPreview = {
  plan_id: string;
  user_id: string;
  current_week: number;
  duration_weeks: number;
  modules: string[];
  next_session: SessionPlan;
  suggested_calendar_times: string[];
};

export type IntakeResponse = {
  plan_preview: PlanPreview;
  smart_goal: string;
  safety_triggered: boolean;
  triage_message: string | null;
};

export type SessionCompleteResponse = {
  next_recommendation: SessionPlan;
  reward: number;
  rationale: string;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: "bearer";
  user_id: string;
  anonymous: boolean;
};

export type AnonymousAuthResponse = AuthTokenResponse & {
  anon_id: string;
};

export type MeResponse = {
  user_id: string;
  anonymous: boolean;
  created_at: string;
};

export type SafetyFlagItem = {
  id: number;
  user_id: string;
  trigger_type: string;
  review_status: string;
  created_at: string;
};

export type QueueHealthResponse = {
  connected: boolean;
  queue_size: number;
};

export type ResolveReviewStatus = "resolved" | "dismissed";
