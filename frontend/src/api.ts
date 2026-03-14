import type {
  AnonymousAuthResponse,
  AuthTokenResponse,
  IntakeRequest,
  IntakeResponse,
  MeResponse,
  QueueHealthResponse,
  ResolveReviewStatus,
  SafetyFlagItem,
  SessionCompleteResponse,
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

function adminHeaders(adminKey: string): Record<string, string> {
  return {
    "X-Admin-Key": adminKey,
  };
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
