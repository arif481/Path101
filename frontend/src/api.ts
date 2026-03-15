import type {
  BanditAnalyticsResponse,
  AnonymousAuthResponse,
  AuthTokenResponse,
  DeadLetterJobItem,
  DeadLetterReplayResponse,
  IntakeRequest,
  IntakeResponse,
  MeResponse,
  QueueHealthResponse,
  ResolveReviewStatus,
  SchedulerTickResponse,
  SafetyFlagItem,
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

export async function listDeadLetterJobs(adminKey: string, limit = 50): Promise<DeadLetterJobItem[]> {
  const response = await fetch(`${BASE_URL}/admin/dead-letter-jobs?limit=${limit}`, {
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
