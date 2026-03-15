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
  is_admin: boolean;
};

export type AnonymousAuthResponse = AuthTokenResponse & {
  anon_id: string;
};

export type MeResponse = {
  user_id: string;
  anonymous: boolean;
  is_admin: boolean;
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
  dead_letter_size: number;
};

export type DeadLetterJobItem = {
  dead_letter_id: string;
  job_type: string;
  user_id: string;
  attempt: number;
  dead_letter_reason: string | null;
  dead_lettered_at: string | null;
  created_at: string | null;
};

export type DeadLetterReplayResponse = {
  status: "replayed";
  dead_letter_id: string;
};

export type DeadLetterReplayAuditItem = {
  id: number;
  dead_letter_id: string;
  job_type: string;
  job_user_id: string;
  admin_user_id: string;
  replay_status: string;
  replayed_at: string;
};

export type ResolveReviewStatus = "resolved" | "dismissed";

export type WorkerEventItem = {
  id: number;
  user_id: string;
  action_id: string;
  reward: number;
  source: string;
  timestamp: string;
};

export type SchedulerTickResponse = {
  scanned_sessions: number;
  acquired_locks: number;
  enqueued_jobs: number;
};

export type ActionAnalyticsItem = {
  action_id: string;
  count: number;
  avg_reward: number;
  last_seen: string;
};

export type BanditAnalyticsResponse = {
  days: number;
  total_events: number;
  actions: ActionAnalyticsItem[];
};

export type UserAnalyticsItem = {
  user_id: string;
  sessions_total: number;
  sessions_completed: number;
  completion_rate: number;
  avg_reward: number;
  reward_trend: "up" | "down" | "flat" | "insufficient";
  last_activity: string | null;
};

export type UserAnalyticsResponse = {
  days: number;
  total_users: number;
  users: UserAnalyticsItem[];
};
