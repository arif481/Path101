/**
 * AI Service — Gemini-powered workspace engine
 *
 * Path101 is a student success operating system. The AI is responsible for
 * turning a student's goal, constraints, and support needs into a bespoke
 * workspace made of milestones, actions, wellbeing support, and feedback.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AIProgressInsight,
  AIStudentAnalysis,
  AIWorkspace,
  ProgressCheckIn,
  StudentProfileInput,
  WorkspaceAction,
  WorkspaceFocusMode,
  WorkspaceMilestone,
  WorkspaceModule,
} from "../../types/workspace";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? "";
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const model = genAI?.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 4096,
    responseMimeType: "application/json",
  },
});

const chatModel = genAI?.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.8,
    maxOutputTokens: 1536,
  },
});

type ChatMode = "planning" | "study" | "recovery" | "accountability" | "decision" | "general";

function parseJsonResponse<T>(raw: string): T {
  const normalized = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(normalized) as T;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function slugId(prefix: string, label: string, index: number): string {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `${prefix}_${normalized || "item"}_${index + 1}`;
}

function describeInput(value?: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "Not provided";
}

function summarizeProfile(profile: StudentProfileInput): string {
  return [
    `Goal: ${profile.goal}`,
    `Timeframe: ${profile.timeframe}`,
    `Weekly capacity: ${profile.weeklyCapacity}`,
    `Current reality: ${profile.currentReality}`,
    `Support needs: ${profile.supportNeeds}`,
    `Success definition: ${describeInput(profile.successDefinition)}`,
    `Biggest blocker: ${describeInput(profile.biggestBlocker)}`,
    `Preferred system mode: ${describeInput(profile.studentMode)}`,
  ].join("\n");
}

function deriveRiskLevel(profile: StudentProfileInput): "stable" | "watch" | "critical" {
  const combined = [
    profile.goal,
    profile.currentReality,
    profile.supportNeeds,
    profile.biggestBlocker,
  ]
    .join(" ")
    .toLowerCase();

  if (/(self-harm|suicid|kill myself|unsafe)/i.test(combined)) return "critical";
  if (/(burnout|panic|overwhelm|anxious|depress|exhaust|fatigue|crash)/i.test(combined)) return "watch";
  return "stable";
}

function fallbackAnalysis(profile: StudentProfileInput): AIStudentAnalysis {
  const riskLevel = deriveRiskLevel(profile);
  const priorities = [
    "Clarify the success criteria for the goal",
    "Build a weekly execution rhythm that fits real capacity",
    "Protect energy, stress, and consistency while progressing",
  ];

  const constraints = profile.currentReality
    ? [
        "Current responsibilities create time fragmentation",
        "Execution will fail if the plan assumes ideal conditions",
      ]
    : ["The plan needs lightweight systems before intensity"];

  return {
    summary: `You are aiming for ${profile.goal.trim()} within ${profile.timeframe.trim()}. The app should support execution, structure, and wellbeing together so progress feels realistic instead of overwhelming.`,
    primaryGoal: profile.goal.trim(),
    outcomeVision: `A student who is consistently moving toward ${profile.goal.trim()} with visible momentum, calmer planning, and a system that adjusts when life gets messy.`,
    priorities,
    strengths: [
      "You already know the outcome you care about",
      "You are asking for a system instead of just motivation",
      "You are open to support across both performance and wellbeing",
    ],
    constraints,
    blindSpots: [
      "The goal may be clearer than the weekly operating rhythm",
      "Support needs might appear only after momentum drops",
    ],
    supportModes: [
      "Visual roadmap and milestone tracking",
      "Weekly planning and accountability prompts",
      "Adaptive wellbeing support when stress rises",
    ],
    mentalHealthConsiderations: [
      "Treat mental health as a capacity signal, not a separate app lane",
      "Include recovery and emotional regulation if stress starts blocking action",
    ],
    energyProfile: "Best suited for a balanced system with low-friction starts and visible wins.",
    diagnosticHeadline: "This student needs a system that protects consistency more than intensity.",
    operatingMode:
      profile.studentMode?.trim() || (riskLevel === "watch" ? "Recovery-aware momentum mode" : "Balanced momentum mode"),
    riskLevel,
    leveragePoints: [
      "Reduce startup friction so work begins before motivation negotiations start",
      "Use visible proof of progress to lower anxiety and improve follow-through",
      "Treat energy dips as a signal to adapt the plan, not abandon it",
    ],
    expertNotes: [
      "The student probably does not need more ambition; they need a more survivable operating rhythm.",
      "The best system will create calm through clarity, then use small wins to grow confidence.",
    ],
    safetyAlert: null,
  };
}

function fallbackModules(analysis: AIStudentAnalysis): WorkspaceModule[] {
  return [
    {
      id: "module_execution",
      kind: "execution",
      title: "Execution engine",
      description: "Turns the goal into clear next moves so progress never depends on motivation alone.",
      items: [
        "One core action for today",
        "Three decisive actions for the week",
        "Fast recovery path if momentum slips",
      ],
      tone: "Focused and practical",
    },
    {
      id: "module_systems",
      kind: "systems",
      title: "Student systems",
      description: "Organizes planning, routines, and constraints around real student life.",
      items: [
        "Weekly planning ritual",
        "Time-block ideas based on actual capacity",
        "Simplified capture system for tasks and worries",
      ],
      tone: "Calm structure",
    },
    {
      id: "module_wellbeing",
      kind: "wellbeing",
      title: "Wellbeing support",
      description: "Keeps energy, stress, and mental load visible so the plan adapts before burnout does.",
      items: analysis.mentalHealthConsiderations,
      tone: "Supportive and grounding",
    },
    {
      id: "module_support",
      kind: "support",
      title: "Adaptive support",
      description: "Pulls in support behaviors only when they serve the main goal.",
      items: analysis.supportModes,
      tone: "Responsive",
    },
  ];
}

function fallbackMilestones(goal: string): WorkspaceMilestone[] {
  return [
    {
      id: "milestone_direction",
      title: "Define the path",
      description: `Translate ${goal} into a concrete path with finish lines, constraints, and first proof points.`,
      dueLabel: "Week 1",
      status: "active",
      completionPercent: 34,
      actionIds: ["action_map", "action_schedule"],
      outcomes: [
        "Success criteria written in plain language",
        "A realistic weekly operating rhythm selected",
      ],
    },
    {
      id: "milestone_momentum",
      title: "Build momentum",
      description: "Lock in a repeatable cadence that survives busy weeks instead of collapsing under them.",
      dueLabel: "Weeks 2-4",
      status: "queued",
      completionPercent: 0,
      actionIds: ["action_start", "action_review", "action_reset"],
      outcomes: [
        "Three weeks of visible execution",
        "A recovery habit for low-energy days",
      ],
    },
    {
      id: "milestone_proof",
      title: "Show proof of progress",
      description: "Create measurable evidence that the system is moving the student toward the goal.",
      dueLabel: "Weeks 5-8",
      status: "queued",
      completionPercent: 0,
      actionIds: ["action_scoreboard", "action_support"],
      outcomes: [
        "Progress artifacts collected",
        "Support system refined from real data",
      ],
    },
  ];
}

function fallbackFocusModes(): WorkspaceFocusMode[] {
  return [
    {
      id: "focus_mode_start",
      title: "Start friction downshift",
      trigger: "Use when the task feels heavier than it should.",
      description: "Shrinks activation energy so starting stops feeling like a negotiation.",
      moves: [
        "Cut the next move to a 10-minute proof-of-start",
        "Open only the one tab or document that matters",
        "Define what 'done enough' looks like before starting",
      ],
    },
    {
      id: "focus_mode_deep",
      title: "Protected deep-work burst",
      trigger: "Use when clarity is high and you have one clean block.",
      description: "Turns a good focus window into visible strategic progress instead of scattered effort.",
      moves: [
        "Pick one milestone outcome, not three side quests",
        "Work in a 45-minute block with a tiny post-block review",
        "Capture distractions without switching context",
      ],
    },
    {
      id: "focus_mode_reset",
      title: "Recovery-preserving reset",
      trigger: "Use when stress climbs and momentum starts slipping.",
      description: "Protects the goal by lightening the load before the system breaks.",
      moves: [
        "Keep one core commitment and defer the rest",
        "Swap high-energy work for one low-friction maintenance task",
        "Reset your environment before deciding the day is lost",
      ],
    },
  ];
}

function fallbackActions(): WorkspaceAction[] {
  return [
    {
      id: "action_map",
      milestoneId: "milestone_direction",
      title: "Write the real finish line",
      detail: "Describe what success looks like, how you will know it happened, and what would count as strong progress in the next 30 days.",
      durationMins: 20,
      energy: "medium",
      lane: "today",
      status: "todo",
      impact: "core",
    },
    {
      id: "action_schedule",
      milestoneId: "milestone_direction",
      title: "Choose your weekly capacity windows",
      detail: "Mark where focused work, low-energy admin, and recovery fit into the week you actually live in.",
      durationMins: 25,
      energy: "low",
      lane: "today",
      status: "todo",
      impact: "core",
    },
    {
      id: "action_start",
      milestoneId: "milestone_momentum",
      title: "Set a non-negotiable starter block",
      detail: "Create one recurring study or execution block that is short enough to survive stressful weeks.",
      durationMins: 15,
      energy: "low",
      lane: "this_week",
      status: "todo",
      impact: "core",
    },
    {
      id: "action_review",
      milestoneId: "milestone_momentum",
      title: "Run a Friday review",
      detail: "Review what moved the goal forward, what got in the way, and what needs to change next week.",
      durationMins: 20,
      energy: "medium",
      lane: "this_week",
      status: "todo",
      impact: "support",
    },
    {
      id: "action_reset",
      milestoneId: "milestone_momentum",
      title: "Create a stress reset protocol",
      detail: "Write a 10-minute recovery routine for days when anxiety, fatigue, or overload start disrupting progress.",
      durationMins: 10,
      energy: "low",
      lane: "support",
      status: "todo",
      impact: "support",
    },
    {
      id: "action_scoreboard",
      milestoneId: "milestone_proof",
      title: "Make a visible progress scoreboard",
      detail: "Track completion, consistency, and one meaningful outcome metric so momentum is visible at a glance.",
      durationMins: 15,
      energy: "medium",
      lane: "this_week",
      status: "todo",
      impact: "stretch",
    },
    {
      id: "action_support",
      milestoneId: "milestone_proof",
      title: "Audit support needs",
      detail: "Decide which supports are helping the goal, which are noise, and what needs to be more personalized next.",
      durationMins: 15,
      energy: "low",
      lane: "support",
      status: "todo",
      impact: "support",
    },
  ];
}

function fallbackWorkspace(
  profile: StudentProfileInput,
  analysis: AIStudentAnalysis
): AIWorkspace {
  const actions = fallbackActions();
  const milestones = fallbackMilestones(profile.goal).map((milestone) => ({
    ...milestone,
    completionPercent: clampPercent(
      milestone.actionIds.length > 0
        ? (milestone.actionIds.filter((id) => actions.find((action) => action.id === id && action.status === "done")).length /
            milestone.actionIds.length) *
            100
        : milestone.completionPercent
    ),
  }));

  return {
    workspaceTitle: `${profile.goal.trim()} OS`,
    workspaceSubtitle: "A custom operating system built around how this student actually works.",
    northStar: analysis.outcomeVision,
    strategy: `${analysis.summary} Build a system that combines execution, academic planning, and wellbeing support without splitting them into separate apps.`,
    momentumLabel: "Laying foundations for reliable momentum",
    celebrationNote: "Small visible wins compound faster than heroic bursts.",
    modules: fallbackModules(analysis),
    metrics: [
      {
        id: "metric_clarity",
        label: "Clarity",
        value: 72,
        targetLabel: "Goal and roadmap aligned",
        insight: "The direction is strong. The next gain comes from translating it into repeatable weekly behavior.",
        trend: "up",
        deltaLabel: "Direction is sharpening",
      },
      {
        id: "metric_execution",
        label: "Execution rhythm",
        value: 48,
        targetLabel: "Consistent 3-week cadence",
        insight: "Momentum exists, but it still needs structure that survives friction.",
        trend: "steady",
        deltaLabel: "Needs protection",
      },
      {
        id: "metric_capacity",
        label: "Capacity fit",
        value: 61,
        targetLabel: "Plan matches real energy",
        insight: "The system should respect mental load and protect recovery on heavy weeks.",
        trend: "up",
        deltaLabel: "More realistic",
      },
    ],
    milestones,
    actions,
    checkIns: [
      {
        id: "checkin_weekly",
        title: "Weekly alignment review",
        frequency: "Every week",
        prompts: [
          "What actually moved the goal this week?",
          "Where did stress or confusion slow you down?",
          "What needs to be simplified before next week starts?",
        ],
      },
      {
        id: "checkin_recovery",
        title: "Stress and energy check",
        frequency: "Whenever momentum dips",
        prompts: [
          "What is draining focus right now?",
          "Do you need a softer plan, a firmer plan, or more support?",
          "What would make the next 20 minutes easier to start?",
        ],
      },
    ],
    weeklyBlueprint: [
      "Monday: decide the one milestone outcome that matters most this week",
      "Midweek: protect one deep-work block and one low-energy maintenance block",
      "Friday: review proof of progress, friction, and what to simplify next",
    ],
    adaptiveRules: [
      "When stress rises, shrink the next step before adding more pressure",
      "When clarity drops, return to the milestone outcome instead of browsing tasks",
      "When consistency breaks, restart with a proof-of-start action the same day",
    ],
    focusModes: fallbackFocusModes(),
  };
}

function sanitizeWorkspace(workspace: AIWorkspace): AIWorkspace {
  const actions = workspace.actions.map((action, index) => ({
    ...action,
    id: action.id || slugId("action", action.title, index),
    status: action.status || "todo",
  }));

  const milestones = workspace.milestones.map((milestone, index) => {
    const actionIds = milestone.actionIds.length > 0
      ? milestone.actionIds
      : actions
          .filter((action) => action.milestoneId === milestone.id)
          .map((action) => action.id);
    const doneCount = actionIds.filter((id) => actions.find((action) => action.id === id && action.status === "done")).length;

    return {
      ...milestone,
      id: milestone.id || slugId("milestone", milestone.title, index),
      actionIds,
      completionPercent: clampPercent(
        actionIds.length > 0 ? (doneCount / actionIds.length) * 100 : milestone.completionPercent
      ),
    };
  });

  return {
    ...workspace,
    metrics: workspace.metrics.map((metric, index) => ({
      ...metric,
      id: metric.id || slugId("metric", metric.label, index),
      value: clampPercent(metric.value),
      trend: metric.trend || "steady",
      deltaLabel: metric.deltaLabel || "Live signal",
    })),
    modules: workspace.modules.map((module, index) => ({
      ...module,
      id: module.id || slugId("module", module.title, index),
    })),
    milestones,
    actions,
    checkIns: workspace.checkIns.map((checkIn, index) => ({
      ...checkIn,
      id: checkIn.id || slugId("checkin", checkIn.title, index),
    })),
    weeklyBlueprint: workspace.weeklyBlueprint ?? [],
    adaptiveRules: workspace.adaptiveRules ?? [],
    focusModes: (workspace.focusModes ?? []).map((mode, index) => ({
      ...mode,
      id: mode.id || slugId("mode", mode.title, index),
    })),
  };
}

async function generateJsonOrFallback<T>(
  prompt: string,
  fallback: () => T
): Promise<T> {
  if (!model) return fallback();

  try {
    const result = await model.generateContent(prompt);
    return parseJsonResponse<T>(result.response.text());
  } catch {
    return fallback();
  }
}

export async function analyzeStudentProfile(
  profile: StudentProfileInput,
  pastContext?: string
): Promise<AIStudentAnalysis> {
  const prompt = `You are Path101, an elite student success strategist.

Your job is to understand the whole student: goal execution, academics, habits, wellbeing, time, stress, and support.

${pastContext ? `Context from earlier Path101 workspaces:\n${pastContext}\n` : ""}

Student profile:
${summarizeProfile(profile)}

Return JSON with this exact shape:
{
  "summary": "2-3 sentence strategic summary of the student's situation",
  "primaryGoal": "The goal in plain language",
  "outcomeVision": "What success should feel and look like",
  "priorities": ["3-5 immediate priorities"],
  "strengths": ["2-4 strengths the student can build on"],
  "constraints": ["2-5 real constraints or risks"],
  "blindSpots": ["1-3 likely blind spots"],
  "supportModes": ["2-5 ways the app should support this student"],
  "mentalHealthConsiderations": ["0-3 notes only if relevant to execution or capacity"],
  "energyProfile": "How the plan should pace itself",
  "diagnosticHeadline": "One-line expert diagnosis",
  "operatingMode": "The system mode this student should run in",
  "riskLevel": "stable | watch | critical",
  "leveragePoints": ["2-4 highest leverage moves"],
  "expertNotes": ["2-3 notes from an expert perspective"],
  "safetyAlert": null
}

Rules:
- Path101 is not a therapy-only app.
- Mental health matters when it affects the student's capacity, focus, or safety.
- Do not prescribe predefined features. Recommend forms of support.
- Think like a synthesis of an academic strategist, executive-function coach, learning scientist, and wellbeing-aware performance coach.
- Make the diagnosis sharp. Avoid generic encouragement masquerading as analysis.
- If the student sounds unsafe or at risk of self-harm, set "safetyAlert" to a concise urgent message telling them to contact local emergency services or a crisis hotline immediately and to reach a trusted person now.`;

  return generateJsonOrFallback(prompt, () => fallbackAnalysis(profile));
}

export async function generateWorkspace(
  profile: StudentProfileInput,
  analysis: AIStudentAnalysis
): Promise<AIWorkspace> {
  const prompt = `You are Path101, creating a custom student operating system.

Build a dynamic workspace for this student. It must feel like a complete support system across execution, academics, wellbeing, and accountability when relevant.

Student profile:
${summarizeProfile(profile)}

Analysis:
- Summary: ${analysis.summary}
- Primary goal: ${analysis.primaryGoal}
- Outcome vision: ${analysis.outcomeVision}
- Priorities: ${analysis.priorities.join("; ")}
- Strengths: ${analysis.strengths.join("; ")}
- Constraints: ${analysis.constraints.join("; ")}
- Blind spots: ${analysis.blindSpots.join("; ")}
- Support modes: ${analysis.supportModes.join("; ")}
- Mental health considerations: ${analysis.mentalHealthConsiderations.join("; ") || "None"}
- Energy profile: ${analysis.energyProfile}

Return JSON with this exact shape:
{
  "workspaceTitle": "Short title",
  "workspaceSubtitle": "One sentence",
  "northStar": "Outcome statement",
  "strategy": "2-4 sentence strategy",
  "momentumLabel": "Current momentum state",
  "celebrationNote": "One line of encouragement",
  "modules": [
    {
      "id": "module_id",
      "kind": "execution | wellbeing | study | career | systems | support",
      "title": "Module title",
      "description": "What this module does",
      "items": ["3-5 generated items"],
      "tone": "How the module should feel"
    }
  ],
  "metrics": [
    {
      "id": "metric_id",
      "label": "Metric label",
      "value": 0-100,
      "targetLabel": "What good looks like",
      "insight": "What this metric means",
      "trend": "up | steady | down",
      "deltaLabel": "Short trend label"
    }
  ],
  "milestones": [
    {
      "id": "milestone_id",
      "title": "Milestone title",
      "description": "What changes here",
      "dueLabel": "Deadline label",
      "status": "queued | active | at_risk | complete",
      "completionPercent": 0-100,
      "actionIds": ["action ids tied to this milestone"],
      "outcomes": ["2-4 concrete outcomes"]
    }
  ],
  "actions": [
    {
      "id": "action_id",
      "milestoneId": "milestone_id",
      "title": "Action title",
      "detail": "Specific action detail",
      "durationMins": 5-90,
      "energy": "low | medium | high",
      "lane": "today | this_week | support",
      "status": "todo | in_progress | done",
      "impact": "core | support | stretch"
    }
  ],
  "checkIns": [
    {
      "id": "checkin_id",
      "title": "Check-in name",
      "frequency": "How often",
      "prompts": ["2-4 prompts"]
    }
  ],
  "weeklyBlueprint": ["3-5 short lines describing the weekly operating rhythm"],
  "adaptiveRules": ["3-5 if-then rules for adapting the system"],
  "focusModes": [
    {
      "id": "mode_id",
      "title": "Mode title",
      "trigger": "When to use this mode",
      "description": "Why this mode exists",
      "moves": ["2-4 clear steps"]
    }
  ]
}

Rules:
- The workspace must be generated from the student's needs, not from a fixed feature menu.
- Use 4-6 modules, 3-5 metrics, 3-4 milestones, 6-10 actions, and 2-3 check-ins.
- Mental health should appear only where it supports the main goal or protects capacity.
- Make it visualizable: clear labels, crisp outcomes, strong action wording.
- Make it expert: every part should feel like it was designed by someone who understands student performance systems, not just task management.
- Keep action ids and milestone actionIds consistent.`;

  const workspace = await generateJsonOrFallback(prompt, () => fallbackWorkspace(profile, analysis));
  return sanitizeWorkspace(workspace);
}

function buildProgressSummary(
  workspace: AIWorkspace,
  checkIns: ProgressCheckIn[]
): string {
  const doneActions = workspace.actions.filter((action) => action.status === "done").length;
  const activeActions = workspace.actions.filter((action) => action.status === "in_progress").length;
  const latestCheckIn = checkIns[checkIns.length - 1];

  return [
    `Workspace: ${workspace.workspaceTitle}`,
    `Momentum: ${workspace.momentumLabel}`,
    `Done actions: ${doneActions}/${workspace.actions.length}`,
    `Active actions: ${activeActions}`,
    latestCheckIn
      ? `Latest check-in -> energy ${latestCheckIn.energy}/5, focus ${latestCheckIn.focus}/5, stress ${latestCheckIn.stress}/5, note: ${latestCheckIn.note || "none"}`
      : "No check-ins yet",
  ].join("\n");
}

function fallbackInsight(
  workspace: AIWorkspace,
  checkIns: ProgressCheckIn[]
): AIProgressInsight {
  const completed = workspace.actions.filter((action) => action.status === "done").length;
  const latest = checkIns[checkIns.length - 1];

  return {
    headline:
      completed > 0
        ? "Momentum is real, but the system still needs protecting."
        : "The system is in setup mode, which is the right place to remove friction first.",
    momentum:
      latest && latest.stress >= 4
        ? "Stress is high enough that the next move should reduce weight before adding more work."
        : "Progress will come fastest from keeping the next action obvious and small enough to start.",
    wins: [
      "The workspace connects execution and wellbeing instead of splitting them apart",
      "The milestones make progress visible, which lowers decision fatigue",
      completed > 0 ? "You already have proof that the system can move" : "You have a clear next move instead of vague motivation",
    ],
    friction: [
      "If the weekly rhythm is too idealized, momentum will break",
      "Support needs should be adjusted based on energy, not ignored until burnout",
    ],
    nextMove:
      latest && latest.focus <= 2
        ? "Shrink the next action, reduce context switching, and protect one clean work block."
        : "Complete one core action today, then review whether the system still fits your real week.",
    adjustments: [
      latest && latest.stress >= 4
        ? "Switch to a recovery-aware plan for the next 24 hours"
        : "Keep one visible core action at the center of the day",
      latest && latest.focus <= 2
        ? "Reduce context switching and lower startup friction"
        : "Preserve one protected focus block before adding more tasks",
    ],
  };
}

export async function generateProgressInsight(
  workspace: AIWorkspace,
  checkIns: ProgressCheckIn[]
): Promise<AIProgressInsight> {
  const prompt = `You are Path101 reviewing a student's operating system.

${buildProgressSummary(workspace, checkIns)}

Return JSON:
{
  "headline": "One sentence on the student's current state",
  "momentum": "What the current momentum pattern means",
  "wins": ["2-4 real wins"],
  "friction": ["1-3 bottlenecks"],
  "nextMove": "The best next move",
  "adjustments": ["2-4 concrete system adjustments"]
}

Rules:
- Evaluate the whole system, not just mood.
- Balance execution, wellbeing, academic pressure, and capacity.
- Be honest, specific, and forward-looking.`;

  return generateJsonOrFallback(prompt, () => fallbackInsight(workspace, checkIns));
}

function buildWorkspaceContext(workspace?: AIWorkspace | null): string {
  if (!workspace) return "";

  const milestoneSummary = workspace.milestones
    .map((milestone) => `${milestone.title} (${milestone.status}, ${milestone.completionPercent}%)`)
    .join("; ");

  const actionSummary = workspace.actions
    .slice(0, 6)
    .map((action) => `${action.title} [${action.status}]`)
    .join("; ");

  return `Workspace context:
- Title: ${workspace.workspaceTitle}
- Strategy: ${workspace.strategy}
- Milestones: ${milestoneSummary}
- Actions: ${actionSummary}
- Adaptive rules: ${(workspace.adaptiveRules ?? []).join("; ") || "None"}
- Focus modes: ${(workspace.focusModes ?? []).map((mode) => mode.title).join("; ") || "None"}`;
}

function inferChatMode(message: string): ChatMode {
  if (/(study|exam|revision|learn|memor|practice|subject|class|assignment)/i.test(message)) return "study";
  if (/(stress|overwhelm|panic|burnout|anxious|tired|exhaust|mental)/i.test(message)) return "recovery";
  if (/(accountability|keep me on track|check in|follow through|consistent|discipline)/i.test(message)) return "accountability";
  if (/(choose|decide|which|option|priority|should i)/i.test(message)) return "decision";
  if (/(plan|roadmap|schedule|next|break down|organize)/i.test(message)) return "planning";
  return "general";
}

function chatModeGuidance(mode: ChatMode): string {
  switch (mode) {
    case "study":
      return "Act like a sharp learning strategist. Optimize for comprehension, retention, sequencing, and manageable study structure.";
    case "recovery":
      return "Act like a wellbeing-aware performance coach. Reduce overload, protect safety, and adapt the plan without sounding clinical.";
    case "accountability":
      return "Act like an execution coach. Be direct, specific, and momentum-oriented with clear follow-through cues.";
    case "decision":
      return "Act like a strategic advisor. Compare options, name tradeoffs, and recommend the strongest path with reasons.";
    case "planning":
      return "Act like an expert planner. Translate the situation into a clear sequence, scope, and next steps.";
    default:
      return "Act like an adaptive student success strategist who keeps advice practical and high leverage.";
  }
}

function fallbackChatReply(message: string, workspace?: AIWorkspace | null): string {
  const hasWorkspace = Boolean(workspace);

  if (/stress|overwhelm|burnout|anxious|panic/i.test(message)) {
    return "Protect the system before you push it harder. Keep one core commitment, cut everything else to optional, reset your environment for 10 minutes, and choose the smallest action that still counts as real progress.";
  }

  if (/study|exam|revision|learn|practice/i.test(message)) {
    return "Use a tighter study loop: pick one topic, define the output you need, do one focused practice block, and finish with a 3-minute recall test so the session produces evidence instead of just time spent.";
  }

  if (/plan|roadmap|next/i.test(message)) {
    return hasWorkspace
      ? "Work from the system in this order: one core action today, one structural improvement this week, then a short review. That keeps momentum visible without letting the goal dissolve into vague effort."
      : "Start by naming the exact outcome, the timeframe, and how many hours you can honestly give each week. Path101 can then build the right system around that instead of giving generic advice.";
  }

  return hasWorkspace
    ? "Use the workspace like a control room: pick the highest-leverage next move, match it to your real energy, and let visible proof of progress matter more than doing everything at once."
    : "Describe the goal, your current constraints, and where you feel stuck. The clearer the reality, the better Path101 can build something that actually fits you.";
}

export async function chat(
  message: string,
  history: Array<{ role: "user" | "assistant"; text: string }>,
  workspace?: AIWorkspace | null
): Promise<string> {
  if (!chatModel) return fallbackChatReply(message, workspace);

  const mode = inferChatMode(message);
  const historyPrompt = history
    .map((entry) => `${entry.role === "user" ? "Student" : "Path101"}: ${entry.text}`)
    .join("\n");

  const prompt = `You are Path101, an adaptive student success operating system.

You help with planning, academics, habits, execution, and wellbeing support when needed.
You are not therapy-only, and you do not sound clinical.
Be concise, warm, practical, strategic, and expert.
${chatModeGuidance(mode)}

${buildWorkspaceContext(workspace)}
${historyPrompt ? `\nConversation so far:\n${historyPrompt}\n` : ""}
Student: ${message}

Rules:
- Give the strongest recommendation first.
- Name tradeoffs when there are multiple good paths.
- Prefer concrete next actions over abstract motivation.
- If the student sounds unsafe, tell them to contact local emergency services or a crisis line immediately and reach a trusted person now.

Path101:`;

  try {
    const result = await chatModel.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return fallbackChatReply(message, workspace);
  }
}
