export type StudentProfileInput = {
  goal: string;
  timeframe: string;
  weeklyCapacity: string;
  currentReality: string;
  supportNeeds: string;
};

export type AIStudentAnalysis = {
  summary: string;
  primaryGoal: string;
  outcomeVision: string;
  priorities: string[];
  strengths: string[];
  constraints: string[];
  blindSpots: string[];
  supportModes: string[];
  mentalHealthConsiderations: string[];
  energyProfile: string;
  safetyAlert: string | null;
};

export type WorkspaceModuleKind =
  | "execution"
  | "wellbeing"
  | "study"
  | "career"
  | "systems"
  | "support";

export type WorkspaceModule = {
  id: string;
  kind: WorkspaceModuleKind;
  title: string;
  description: string;
  items: string[];
  tone: string;
};

export type ProgressMetric = {
  id: string;
  label: string;
  value: number;
  targetLabel: string;
  insight: string;
};

export type WorkspaceMilestoneStatus = "queued" | "active" | "at_risk" | "complete";

export type WorkspaceMilestone = {
  id: string;
  title: string;
  description: string;
  dueLabel: string;
  status: WorkspaceMilestoneStatus;
  completionPercent: number;
  actionIds: string[];
  outcomes: string[];
};

export type WorkspaceActionStatus = "todo" | "in_progress" | "done";

export type WorkspaceAction = {
  id: string;
  milestoneId: string;
  title: string;
  detail: string;
  durationMins: number;
  energy: "low" | "medium" | "high";
  lane: "today" | "this_week" | "support";
  status: WorkspaceActionStatus;
  impact: "core" | "support" | "stretch";
};

export type WorkspaceCheckInPrompt = {
  id: string;
  title: string;
  frequency: string;
  prompts: string[];
};

export type AIWorkspace = {
  workspaceTitle: string;
  workspaceSubtitle: string;
  northStar: string;
  strategy: string;
  momentumLabel: string;
  celebrationNote: string;
  modules: WorkspaceModule[];
  metrics: ProgressMetric[];
  milestones: WorkspaceMilestone[];
  actions: WorkspaceAction[];
  checkIns: WorkspaceCheckInPrompt[];
};

export type ProgressCheckIn = {
  energy: number;
  focus: number;
  stress: number;
  note: string;
  createdAt: string;
};

export type AIProgressInsight = {
  headline: string;
  momentum: string;
  wins: string[];
  friction: string[];
  nextMove: string;
};

export type StoredWorkspace = {
  workspaceId: string;
  userId: string;
  profile: StudentProfileInput;
  analysis: AIStudentAnalysis;
  workspace: AIWorkspace;
};
