/**
 * Client-side intake service — ported from backend/app/services/intake.py
 *
 * Pure-computation: keyword classification, plan generation, session building,
 * SMART goal text, and reward formula. No external API calls.
 */

export type SessionStep = {
  title: string;
  durationMins: number;
};

export type SessionPlan = {
  sessionId: string;
  title: string;
  durationMins: number;
  steps: SessionStep[];
  expectedMetrics: string[];
  difficulty: "low" | "medium" | "high";
  scheduledAt: string | null;
};

export type PlanPreview = {
  planId: string;
  userId: string;
  currentWeek: number;
  durationWeeks: number;
  modules: string[];
  nextSession: SessionPlan;
  suggestedCalendarTimes: string[];
};

// ── Keyword classification ──────────────────────────────────

const KEYWORD_LABELS: Record<string, string[]> = {
  procrastination: ["delay", "procrast", "later", "avoid", "starting", "assignment"],
  anxiety: ["anxious", "worry", "panic", "nervous"],
  insomnia: ["sleep", "insomnia", "awake", "tired", "fatigue"],
  low_mood: ["sad", "low mood", "hopeless", "empty", "down"],
  exam_stress: ["exam", "test", "study", "grade"],
};

const MODULE_LIBRARY: Record<string, { targets: string[]; bctTags: string[]; weeks: number }> = {
  procrastination_starter: {
    targets: ["procrastination", "exam_stress"],
    bctTags: ["1.1", "1.4", "7.1", "8.3", "8.7"],
    weeks: 2,
  },
  anxiety_downshift: {
    targets: ["anxiety", "exam_stress"],
    bctTags: ["1.2", "1.4", "11.2", "15.1"],
    weeks: 2,
  },
  sleep_reset: {
    targets: ["insomnia"],
    bctTags: ["1.4", "7.1", "8.2", "8.3"],
    weeks: 2,
  },
  mood_activation: {
    targets: ["low_mood"],
    bctTags: ["1.1", "1.4", "8.7", "15.1"],
    weeks: 2,
  },
};

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function classifyIntents(text: string): string[] {
  const normalized = normalizeText(text);
  const scores: Record<string, number> = {};

  for (const [label, keywords] of Object.entries(KEYWORD_LABELS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        scores[label] = (scores[label] ?? 0) + 1;
      }
    }
  }

  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);

  return ranked.length > 0 ? ranked : ["procrastination"];
}

// ── SMART goal ──────────────────────────────────────────────

export function buildSmartGoal(rawText: string, availableTimes: string[]): string {
  const normalized = normalizeText(rawText);
  let base: string;

  if (normalized.includes("2 hours") || normalized.includes("two hours")) {
    base = "Complete two 25-minute focused sessions";
  } else if (normalized.includes("1 hour") || normalized.includes("one hour")) {
    base = "Complete one 25-minute focused session";
  } else {
    base = "Complete one 10-minute starter session";
  }

  const when = availableTimes.length > 0 ? `during ${availableTimes[0]} this week` : "this week";
  return `${base} Mon-Fri ${when}.`;
}

// ── Module selection ────────────────────────────────────────

function chooseModules(labels: string[]): string[] {
  const selected: string[] = [];
  for (const [moduleId, mod] of Object.entries(MODULE_LIBRARY)) {
    if (labels.some((label) => mod.targets.includes(label))) {
      selected.push(moduleId);
    }
  }
  if (selected.length === 0) {
    selected.push("procrastination_starter");
  }
  return selected.slice(0, 2);
}

// ── Session building ────────────────────────────────────────

function randomHexId(length: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function buildInitialSession(labels: string[], availableTimes: string[]): SessionPlan {
  const scheduledAt =
    availableTimes.length > 0
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

  let title: string;
  let steps: SessionStep[];
  let durationMins: number;

  if (labels.includes("insomnia")) {
    title = "Sleep Wind-Down Starter";
    steps = [
      { title: "Set tomorrow wake time", durationMins: 2 },
      { title: "5-minute breathing reset", durationMins: 5 },
      { title: "Screen-off cue setup", durationMins: 3 },
    ];
    durationMins = 10;
  } else if (labels.includes("anxiety")) {
    title = "Calm + Focus Starter";
    steps = [
      { title: "Name top worry", durationMins: 2 },
      { title: "5-minute paced breathing", durationMins: 5 },
      { title: "10-minute focused task", durationMins: 10 },
    ];
    durationMins = 17;
  } else {
    title = "Procrastination Starter";
    steps = [
      { title: "Environment checklist", durationMins: 2 },
      { title: "10-minute starter focus", durationMins: 10 },
      { title: "Quick reflection", durationMins: 2 },
    ];
    durationMins = 14;
  }

  return {
    sessionId: `sess_${randomHexId(10)}`,
    title,
    durationMins,
    steps,
    expectedMetrics: ["completion", "mood_change"],
    difficulty: "low",
    scheduledAt,
  };
}

// ── Plan compilation ────────────────────────────────────────

export function compilePlan(
  userId: string,
  rawText: string,
  availableTimes: string[]
): { plan: PlanPreview; smartGoal: string } {
  const labels = classifyIntents(rawText);
  const smartGoal = buildSmartGoal(rawText, availableTimes);
  const modules = chooseModules(labels);
  const nextSession = buildInitialSession(labels, availableTimes);

  const plan: PlanPreview = {
    planId: `plan_${randomHexId(10)}`,
    userId,
    currentWeek: 1,
    durationWeeks: 2,
    modules,
    nextSession,
    suggestedCalendarTimes: availableTimes.slice(0, 3),
  };

  return { plan, smartGoal };
}

// ── Reward computation ──────────────────────────────────────

export function computeReward(preMood: number, postMood: number, returned24h: boolean): number {
  const completionReward = 1.0;
  const moodDelta = Math.max(0.0, Math.min(3.0, postMood - preMood)) / 3.0;
  const followup = returned24h ? 1.0 : 0.0;
  const reward = 0.6 * completionReward + 0.3 * moodDelta + 0.1 * followup;
  return Math.round(reward * 10000) / 10000;
}
