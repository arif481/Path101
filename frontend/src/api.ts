import type {
  BanditAnalyticsResponse,
  AnonymousAuthResponse,
  AuthTokenResponse,
  DeadLetterBulkDropResponse,
  DeadLetterBulkReplayResponse,
  DeadLetterDropResponse,
  DeadLetterJobItem,
  DeadLetterPurgeResponse,
  DeadLetterReplayAuditItem,
  DeadLetterReplayResponse,
  DeadLetterSummaryResponse,
  IntakeRequest,
  IntakeResponse,
  MeResponse,
  NotificationLogItem,
  NotificationAnalyticsResponse,
  NotificationSendResponse,
  QueueHealthResponse,
  ResolveReviewStatus,
  SchedulerTickResponse,
  SafetyFlagItem,
  SafetyFlagAnalyticsResponse,
  SessionCompleteResponse,
  UserAnalyticsResponse,
  WorkerEventItem,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function submitIntake(payload: IntakeRequest): Promise<IntakeResponse> {
  const response = await fetch(`${BASE_URL}/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Intake failed");
  }

  return response.json() as Promise<IntakeResponse>;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function adminHeaders(adminToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${adminToken}`,
  };
}

function triggerCsvDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function authAnonymous(): Promise<AnonymousAuthResponse> {
  const response = await fetch(`${BASE_URL}/auth/anonymous`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Anonymous sign-in failed");
  }

  return response.json() as Promise<AnonymousAuthResponse>;
}

export async function authRegister(email: string, password: string): Promise<AuthTokenResponse> {
  const response = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Registration failed");
  }

  return response.json() as Promise<AuthTokenResponse>;
}

export async function authLogin(email: string, password: string): Promise<AuthTokenResponse> {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json() as Promise<AuthTokenResponse>;
}

export async function authMe(token: string): Promise<MeResponse> {
  const response = await fetch(`${BASE_URL}/auth/me`, {
    method: "GET",
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Session validation failed");
  }

  return response.json() as Promise<MeResponse>;
}

export async function completeSession(
  sessionId: string,
  preMood: number,
  postMood: number,
  feedback: string
): Promise<SessionCompleteResponse> {
  const response = await fetch(`${BASE_URL}/session/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pre_mood: preMood, post_mood: postMood, feedback }),
  });

  if (!response.ok) {
    throw new Error("Session completion failed");
  }

  return response.json() as Promise<SessionCompleteResponse>;
}

export async function getAdminQueueHealth(adminKey: string): Promise<QueueHealthResponse> {
  const response = await fetch(`${BASE_URL}/admin/queue-health`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Queue health request failed");
  }

  return response.json() as Promise<QueueHealthResponse>;
}

export async function listNotificationLogs(
  adminKey: string,
  options?: {
    limit?: number;
    offset?: number;
    userId?: string;
    channel?: string;
    status?: string;
  }
): Promise<NotificationLogItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 50));
  params.set("offset", String(options?.offset ?? 0));
  if (options?.userId) {
    params.set("user_id", options.userId);
  }
  if (options?.channel) {
    params.set("channel", options.channel);
  }
  if (options?.status) {
    params.set("status", options.status);
  }

  const response = await fetch(`${BASE_URL}/admin/notifications?${params.toString()}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Notification log request failed");
  }

  return response.json() as Promise<NotificationLogItem[]>;
}

export async function sendTestNotification(
  adminKey: string,
  payload: {
    userId: string;
    channel: string;
    message: string;
  }
): Promise<NotificationSendResponse> {
  const response = await fetch(`${BASE_URL}/admin/notifications/test-send`, {
    method: "POST",
    headers: {
      ...adminHeaders(adminKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: payload.userId,
      channel: payload.channel,
      message: payload.message,
    }),
  });

  if (!response.ok) {
    throw new Error("Notification send request failed");
  }

  return response.json() as Promise<NotificationSendResponse>;
}

export async function getNotificationAnalytics(
  adminKey: string,
  days = 30
): Promise<NotificationAnalyticsResponse> {
  const response = await fetch(`${BASE_URL}/admin/notifications/analytics?days=${days}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Notification analytics request failed");
  }

  return response.json() as Promise<NotificationAnalyticsResponse>;
}

export async function downloadNotificationAnalyticsCsv(adminKey: string, days = 30): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/notifications/analytics.csv?days=${days}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Notification analytics CSV download failed");
  }

  const blob = await response.blob();
  triggerCsvDownload(blob, `path101_notification_analytics_${days}d.csv`);
}

export async function listSafetyFlags(
  adminKey: string,
  reviewStatus?: string
): Promise<SafetyFlagItem[]> {
  const params = new URLSearchParams();
  if (reviewStatus && reviewStatus !== "all") {
    params.set("review_status", reviewStatus);
  }

  const query = params.toString();
  const url = `${BASE_URL}/admin/flags${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Safety flags request failed");
  }

  return response.json() as Promise<SafetyFlagItem[]>;
}

export async function resolveSafetyFlag(
  adminKey: string,
  flagId: number,
  reviewStatus: ResolveReviewStatus
): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/flag/${flagId}/resolve`, {
    method: "POST",
    headers: {
      ...adminHeaders(adminKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ review_status: reviewStatus }),
  });

  if (!response.ok) {
    throw new Error("Resolve flag request failed");
  }
}

export async function triageSafetyFlag(
  adminKey: string,
  payload: {
    flagId: number;
    reviewStatus: "pending" | "in_review" | "resolved" | "dismissed";
    escalationStatus: "none" | "watch" | "escalated" | "urgent";
    triageNotes: string;
  }
): Promise<SafetyFlagItem> {
  const response = await fetch(`${BASE_URL}/admin/flag/${payload.flagId}/triage`, {
    method: "POST",
    headers: {
      ...adminHeaders(adminKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      review_status: payload.reviewStatus,
      escalation_status: payload.escalationStatus,
      triage_notes: payload.triageNotes,
    }),
  });

  if (!response.ok) {
    throw new Error("Triage flag request failed");
  }

  return response.json() as Promise<SafetyFlagItem>;
}

export async function getSafetyFlagAnalytics(adminKey: string): Promise<SafetyFlagAnalyticsResponse> {
  const response = await fetch(`${BASE_URL}/admin/flags/analytics`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Safety analytics request failed");
  }

  return response.json() as Promise<SafetyFlagAnalyticsResponse>;
}

export async function listWorkerEvents(adminKey: string, limit = 25): Promise<WorkerEventItem[]> {
  const response = await fetch(`${BASE_URL}/admin/worker-events?limit=${limit}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Worker events request failed");
  }

  return response.json() as Promise<WorkerEventItem[]>;
}

export async function triggerSchedulerTick(adminKey: string): Promise<SchedulerTickResponse> {
  const response = await fetch(`${BASE_URL}/admin/scheduler/tick`, {
    method: "POST",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Scheduler tick request failed");
  }

  return response.json() as Promise<SchedulerTickResponse>;
}

export async function listDeadLetterJobs(
  adminKey: string,
  options?: {
    limit?: number;
    offset?: number;
    jobType?: string;
    userId?: string;
    reason?: string;
  }
): Promise<DeadLetterJobItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 50));
  params.set("offset", String(options?.offset ?? 0));
  if (options?.jobType) {
    params.set("job_type", options.jobType);
  }
  if (options?.userId) {
    params.set("user_id", options.userId);
  }
  if (options?.reason) {
    params.set("reason", options.reason);
  }

  const response = await fetch(`${BASE_URL}/admin/dead-letter-jobs?${params.toString()}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Dead-letter jobs request failed");
  }

  return response.json() as Promise<DeadLetterJobItem[]>;
}

export async function replayDeadLetterJob(
  adminKey: string,
  deadLetterId: string
): Promise<DeadLetterReplayResponse> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-jobs/${deadLetterId}/replay`, {
    method: "POST",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Dead-letter replay request failed");
  }

  return response.json() as Promise<DeadLetterReplayResponse>;
}

export async function replayDeadLetterJobsBulk(
  adminKey: string,
  deadLetterIds: string[]
): Promise<DeadLetterBulkReplayResponse> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-jobs/replay-bulk`, {
    method: "POST",
    headers: {
      ...adminHeaders(adminKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dead_letter_ids: deadLetterIds }),
  });

  if (!response.ok) {
    throw new Error("Dead-letter bulk replay request failed");
  }

  return response.json() as Promise<DeadLetterBulkReplayResponse>;
}

export async function dropDeadLetterJob(
  adminKey: string,
  deadLetterId: string
): Promise<DeadLetterDropResponse> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-jobs/${deadLetterId}/drop`, {
    method: "POST",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Dead-letter drop request failed");
  }

  return response.json() as Promise<DeadLetterDropResponse>;
}

export async function dropDeadLetterJobsBulk(
  adminKey: string,
  deadLetterIds: string[]
): Promise<DeadLetterBulkDropResponse> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-jobs/drop-bulk`, {
    method: "POST",
    headers: {
      ...adminHeaders(adminKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dead_letter_ids: deadLetterIds }),
  });

  if (!response.ok) {
    throw new Error("Dead-letter bulk drop request failed");
  }

  return response.json() as Promise<DeadLetterBulkDropResponse>;
}

export async function getDeadLetterSummary(adminKey: string): Promise<DeadLetterSummaryResponse> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-summary`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Dead-letter summary request failed");
  }

  return response.json() as Promise<DeadLetterSummaryResponse>;
}

export async function purgeDeadLetterJobs(
  adminKey: string,
  payload: {
    olderThanDays?: number;
    jobType?: string;
    userId?: string;
    reasonContains?: string;
    limit?: number;
    includeReplayAudits?: boolean;
  }
): Promise<DeadLetterPurgeResponse> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-jobs/purge`, {
    method: "POST",
    headers: {
      ...adminHeaders(adminKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      older_than_days: payload.olderThanDays,
      job_type: payload.jobType,
      user_id: payload.userId,
      reason_contains: payload.reasonContains,
      limit: payload.limit ?? 1000,
      include_replay_audits: payload.includeReplayAudits ?? true,
    }),
  });

  if (!response.ok) {
    throw new Error("Dead-letter purge request failed");
  }

  return response.json() as Promise<DeadLetterPurgeResponse>;
}

export async function listDeadLetterReplays(
  adminKey: string,
  options?: {
    limit?: number;
    offset?: number;
    replayStatus?: string;
    adminUserId?: string;
    jobUserId?: string;
    deadLetterId?: string;
  }
): Promise<DeadLetterReplayAuditItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 50));
  params.set("offset", String(options?.offset ?? 0));
  if (options?.replayStatus) {
    params.set("replay_status", options.replayStatus);
  }
  if (options?.adminUserId) {
    params.set("admin_user_id", options.adminUserId);
  }
  if (options?.jobUserId) {
    params.set("job_user_id", options.jobUserId);
  }
  if (options?.deadLetterId) {
    params.set("dead_letter_id", options.deadLetterId);
  }

  const response = await fetch(`${BASE_URL}/admin/dead-letter-replays/filter?${params.toString()}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Dead-letter replay audit request failed");
  }

  return response.json() as Promise<DeadLetterReplayAuditItem[]>;
}

export async function downloadDeadLetterReplaysCsv(adminKey: string, limit = 100): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-replays.csv?limit=${limit}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Dead-letter replay CSV download failed");
  }

  const blob = await response.blob();
  triggerCsvDownload(blob, "path101_dead_letter_replays.csv");
}

export async function getActionAnalytics(
  adminKey: string,
  days = 30,
  limit = 20
): Promise<BanditAnalyticsResponse> {
  const response = await fetch(`${BASE_URL}/admin/analytics/actions?days=${days}&limit=${limit}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Action analytics request failed");
  }

  return response.json() as Promise<BanditAnalyticsResponse>;
}

export async function getUserAnalytics(
  adminKey: string,
  days = 30,
  limit = 20
): Promise<UserAnalyticsResponse> {
  const response = await fetch(`${BASE_URL}/admin/analytics/users?days=${days}&limit=${limit}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("User analytics request failed");
  }

  return response.json() as Promise<UserAnalyticsResponse>;
}

export async function downloadActionAnalyticsCsv(
  adminKey: string,
  days = 30,
  limit = 20
): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/analytics/actions.csv?days=${days}&limit=${limit}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("Action analytics CSV download failed");
  }

  const blob = await response.blob();
  triggerCsvDownload(blob, `path101_action_analytics_${days}d.csv`);
}

export async function downloadUserAnalyticsCsv(
  adminKey: string,
  days = 30,
  limit = 20
): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/analytics/users.csv?days=${days}&limit=${limit}`, {
    method: "GET",
    headers: adminHeaders(adminKey),
  });

  if (!response.ok) {
    throw new Error("User analytics CSV download failed");
  }

  const blob = await response.blob();
  triggerCsvDownload(blob, `path101_user_analytics_${days}d.csv`);
}
