/**
 * Client-side safety triage service — ported from backend/app/services/safety_triage.py
 *
 * Crisis language detection via regex patterns.
 */

const CRISIS_PATTERNS: RegExp[] = [
  /suicid/i,
  /kill myself/i,
  /end my life/i,
  /self harm/i,
  /hurt myself/i,
];

export type TriageResult = {
  triggered: boolean;
  triggerType: string;
  severityScore: number;
  escalationStatus: "none" | "watch" | "escalated" | "urgent";
  triageMessage: string;
};

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectCrisisLanguage(text: string): boolean {
  const normalized = normalizeText(text);
  return CRISIS_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function evaluateSafetyText(text: string): TriageResult {
  if (!detectCrisisLanguage(text)) {
    return {
      triggered: false,
      triggerType: "",
      severityScore: 0,
      escalationStatus: "none",
      triageMessage: "",
    };
  }

  // Determine severity based on number of pattern matches
  const normalized = normalizeText(text);
  const matchCount = CRISIS_PATTERNS.filter((p) => p.test(normalized)).length;
  const severityScore = Math.min(10, matchCount * 3 + 4);

  const escalationStatus: TriageResult["escalationStatus"] =
    severityScore >= 7 ? "urgent" : severityScore >= 5 ? "escalated" : "watch";

  return {
    triggered: true,
    triggerType: "crisis_language",
    severityScore,
    escalationStatus,
    triageMessage:
      "If you or someone you know is in crisis, please reach out to a crisis helpline immediately. You are not alone.",
  };
}
