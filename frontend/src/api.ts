import type {
  IntakeRequest,
  IntakeResponse,
  SessionCompleteResponse,
} from "./types";

const BASE_URL = "http://127.0.0.1:8000";

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
