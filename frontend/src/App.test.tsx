import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

const authState = {
  user: null as
    | null
    | {
        uid: string;
        isAnonymous: boolean;
        email: string | null;
      },
  token: null,
  profile: null,
  loading: false,
  isAdmin: false,
  signInAnonymous: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
  resetPassword: vi.fn(),
  confirmPasswordReset: vi.fn(),
};

const getLatestWorkspace = vi.fn();

vi.mock("./firebase/config", () => ({
  app: {},
  auth: {},
  db: {},
}));

vi.mock("./firebase/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("./firebase/services/firestoreOps", () => ({
  addSafetyFlag: vi.fn(),
  createSafetyEscalationEvent: vi.fn(),
  getLatestWorkspace: (...args: unknown[]) => getLatestWorkspace(...args),
  recordProgressEvent: vi.fn(),
  saveCheckIn: vi.fn(),
  saveWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
}));

vi.mock("./firebase/services/aiService", () => ({
  analyzeStudentProfile: vi.fn(),
  chat: vi.fn(),
  generateProgressInsight: vi.fn(),
  generateWorkspace: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.user = null;
  getLatestWorkspace.mockResolvedValue(null);
});

describe("App", () => {
  it("renders the auth experience for signed-out users", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Path101" })).toBeInTheDocument();
    });

    expect(screen.getByText("AI-built student success operating system")).toBeInTheDocument();
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
    expect(screen.getByText(/Continue anonymously/)).toBeInTheDocument();
  });

  it("shows the dynamic workspace intake for signed-in users without a workspace", async () => {
    authState.user = {
      uid: "user_123",
      isAnonymous: false,
      email: "student@example.com",
    };
    getLatestWorkspace.mockResolvedValue(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Build everything this student needs/i })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/What are you trying to achieve/i)).toBeInTheDocument();
    expect(screen.getByText(/Generate my Path101 workspace/i)).toBeInTheDocument();
  });

  it("renders a stored workspace dashboard when one exists", async () => {
    authState.user = {
      uid: "user_456",
      isAnonymous: false,
      email: "student@example.com",
    };
    getLatestWorkspace.mockResolvedValue({
      workspaceId: "ws_1",
      userId: "user_456",
      profile: {
        goal: "Land an internship",
        timeframe: "12 weeks",
        weeklyCapacity: "8 hours",
        currentReality: "Classes and assignments",
        supportNeeds: "Interview prep and accountability",
      },
      analysis: {
        summary: "The student needs execution and career support together.",
        primaryGoal: "Land an internship",
        outcomeVision: "A student with a portfolio and an interview rhythm.",
        priorities: ["Portfolio", "Applications", "Recovery"],
        strengths: ["Clear goal"],
        constraints: ["Limited time"],
        blindSpots: ["Needs consistency"],
        supportModes: ["Accountability"],
        mentalHealthConsiderations: ["Protect recovery in heavy weeks"],
        energyProfile: "Short, decisive work blocks.",
        safetyAlert: null,
      },
      workspace: {
        workspaceTitle: "Internship Sprint OS",
        workspaceSubtitle: "A custom operating system for the internship push.",
        northStar: "Land an internship with a calm, visible process.",
        strategy: "Blend portfolio work, outreach, and recovery in one cadence.",
        momentumLabel: "System is moving",
        celebrationNote: "Consistent proof beats panic bursts.",
        metrics: [
          {
            id: "metric_progress",
            label: "Execution progress",
            value: 54,
            targetLabel: "Visible weekly output",
            insight: "Momentum is building.",
          },
        ],
        modules: [
          {
            id: "module_career",
            kind: "career",
            title: "Career engine",
            description: "Portfolio and applications in one lane.",
            items: ["Portfolio refresh", "Application blocks"],
            tone: "Clear and direct",
          },
        ],
        milestones: [
          {
            id: "milestone_1",
            title: "Portfolio ready",
            description: "Show clear project proof.",
            dueLabel: "Week 2",
            status: "active",
            completionPercent: 50,
            actionIds: ["action_1"],
            outcomes: ["Portfolio refreshed"],
          },
        ],
        actions: [
          {
            id: "action_1",
            milestoneId: "milestone_1",
            title: "Update the portfolio case study",
            detail: "Rewrite the strongest project with clearer outcomes.",
            durationMins: 45,
            energy: "medium",
            lane: "today",
            status: "in_progress",
            impact: "core",
          },
        ],
        checkIns: [
          {
            id: "checkin_1",
            title: "Weekly review",
            frequency: "Weekly",
            prompts: ["What moved this forward?"],
          },
        ],
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Internship Sprint OS" })).toBeInTheDocument();
    });

    expect(screen.getByText(/Milestones with visible progress/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Update the portfolio case study/i)).toHaveLength(2);
  });
});
