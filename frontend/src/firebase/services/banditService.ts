/**
 * Client-side bandit policy — ported from backend/app/services/bandit_policy.py
 *
 * Epsilon-greedy multi-armed bandit for session recommendation.
 * Reads history from Firestore banditLogs collection.
 */

import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../config";
import type { SessionPlan } from "./intakeService";

// ── Config ──────────────────────────────────────────────────

const BANDIT_EPSILON = 0.2;
const BANDIT_MIN_HISTORY = 3;

// ── Action candidates ───────────────────────────────────────

export type ActionCandidate = {
  actionId: string;
  plan: SessionPlan;
  rationale: string;
};

function buildCandidates(baseSessionId: string): ActionCandidate[] {
  return [
    {
      actionId: "recovery_10",
      plan: {
        sessionId: `${baseSessionId}_recovery_10`,
        title: "Recovery micro-step",
        durationMins: 10,
        steps: [
          { title: "2-minute setup", durationMins: 2 },
          { title: "8-minute focused burst", durationMins: 8 },
        ],
        expectedMetrics: ["completion", "mood_change"],
        difficulty: "low",
        scheduledAt: null,
      },
      rationale: "Short step prioritized to reduce friction and protect consistency.",
    },
    {
      actionId: "focus_15",
      plan: {
        sessionId: `${baseSessionId}_focus_15`,
        title: "Focus sprint",
        durationMins: 15,
        steps: [
          { title: "3-minute setup", durationMins: 3 },
          { title: "12-minute focused sprint", durationMins: 12 },
        ],
        expectedMetrics: ["completion", "mood_change"],
        difficulty: "medium",
        scheduledAt: null,
      },
      rationale: "Moderate sprint chosen for momentum when baseline stability is acceptable.",
    },
    {
      actionId: "deep_20",
      plan: {
        sessionId: `${baseSessionId}_deep_20`,
        title: "Deep practice block",
        durationMins: 20,
        steps: [
          { title: "4-minute setup", durationMins: 4 },
          { title: "16-minute deep work", durationMins: 16 },
        ],
        expectedMetrics: ["completion", "mood_change"],
        difficulty: "high",
        scheduledAt: null,
      },
      rationale: "Longer block selected to maximize gains when recent outcomes support challenge.",
    },
  ];
}

// ── History lookup (Firestore) ──────────────────────────────

type HistoryStats = Record<string, { avgReward: number; count: number }>;

async function getHistoryStats(userId: string): Promise<HistoryStats> {
  const q = query(collection(db, "banditLogs"), where("userId", "==", userId));
  const snapshot = await getDocs(q);

  const sums: Record<string, { totalReward: number; count: number }> = {};

  snapshot.forEach((doc) => {
    const data = doc.data();
    const actionId = data.actionId as string;
    const reward = (data.reward as number) ?? 0;

    if (!sums[actionId]) {
      sums[actionId] = { totalReward: 0, count: 0 };
    }
    sums[actionId].totalReward += reward;
    sums[actionId].count += 1;
  });

  const stats: HistoryStats = {};
  for (const [actionId, { totalReward, count }] of Object.entries(sums)) {
    stats[actionId] = { avgReward: count > 0 ? totalReward / count : 0, count };
  }
  return stats;
}

// ── Selection algorithm ─────────────────────────────────────

export type BanditResult = {
  plan: SessionPlan;
  actionId: string;
  rationale: string;
  policyVersion: string;
};

export async function selectNextRecommendation(
  userId: string,
  baseSessionId: string,
  feedback: string
): Promise<BanditResult> {
  const candidates = buildCandidates(baseSessionId);

  // Feedback guardrail — if user signals strain, select easiest option
  const loweredFeedback = feedback.trim().toLowerCase();
  const strainTokens = ["tired", "overwhelmed", "anxious", "exhausted"];
  if (strainTokens.some((token) => loweredFeedback.includes(token))) {
    const candidate = candidates[0];
    return {
      plan: candidate.plan,
      actionId: candidate.actionId,
      rationale: "Feedback indicates high strain, so a lower-intensity recommendation was selected.",
      policyVersion: "v1-feedback-guardrail",
    };
  }

  // Fetch history stats from Firestore
  const stats = await getHistoryStats(userId);

  type SampledCandidate = { candidate: ActionCandidate; avgReward: number; count: number };
  const sampled: SampledCandidate[] = candidates.map((candidate) => {
    const s = stats[candidate.actionId] ?? { avgReward: 0, count: 0 };
    return { candidate, avgReward: s.avgReward, count: s.count };
  });

  // Cold start — explore least-sampled action
  const underSampled = sampled.filter((s) => s.count < BANDIT_MIN_HISTORY);
  if (underSampled.length > 0) {
    const best = underSampled.reduce((a, b) => (a.count <= b.count ? a : b));
    return {
      plan: best.candidate.plan,
      actionId: best.candidate.actionId,
      rationale: "Insufficient history detected, so the least-sampled action was explored.",
      policyVersion: "v1-cold-start",
    };
  }

  // Epsilon-greedy
  if (Math.random() < BANDIT_EPSILON) {
    const random = sampled[Math.floor(Math.random() * sampled.length)];
    return {
      plan: random.candidate.plan,
      actionId: random.candidate.actionId,
      rationale: `Exploration branch selected with epsilon=${BANDIT_EPSILON.toFixed(2)}.`,
      policyVersion: "v1-epsilon-explore",
    };
  }

  // Exploit — pick highest average reward
  const best = sampled.reduce((a, b) => (a.avgReward >= b.avgReward ? a : b));
  return {
    plan: best.candidate.plan,
    actionId: best.candidate.actionId,
    rationale: `Exploitation branch selected highest historical reward estimate (${best.avgReward.toFixed(2)}).`,
    policyVersion: "v1-epsilon-exploit",
  };
}
