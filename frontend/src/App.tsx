import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "./firebase/useAuth";
import {
  addSafetyFlag,
  createSafetyEscalationEvent,
  getLatestWorkspace,
  recordProgressEvent,
  saveCheckIn,
  saveWorkspace,
  updateWorkspace,
} from "./firebase/services/firestoreOps";
import type {
  AIProgressInsight,
  AIStudentAnalysis,
  AIWorkspace,
  ProgressCheckIn,
  StudentProfileInput,
  WorkspaceAction,
  WorkspaceActionStatus,
  WorkspaceMilestone,
  WorkspaceModule,
} from "./types/workspace";

type View = "intake" | "generating" | "workspace" | "chat";

type CheckInDraft = {
  energy: number;
  focus: number;
  stress: number;
  note: string;
};

const emptyProfile: StudentProfileInput = {
  goal: "",
  timeframe: "Next 90 days",
  weeklyCapacity: "8-10 focused hours per week",
  currentReality: "",
  supportNeeds: "",
};

const emptyCheckIn: CheckInDraft = {
  energy: 3,
  focus: 3,
  stress: 3,
  note: "",
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function PathGlyph() {
  return (
    <svg viewBox="0 0 64 64" className="path-glyph" aria-hidden="true">
      <defs>
        <linearGradient id="pathGlow" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#0f8b8d" />
          <stop offset="100%" stopColor="#ff7a59" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#pathGlow)" strokeWidth="4" />
      <path d="M18 38c8-18 20-22 28-18 6 3 7 11 1 18" fill="none" stroke="url(#pathGlow)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="18" cy="38" r="4" fill="#0f8b8d" />
      <circle cx="46" cy="38" r="4" fill="#ff7a59" />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="typing-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function AuthScreen({
  onAnonymous,
  onGoogle,
  onEmailAuth,
  loading,
  error,
}: {
  onAnonymous: () => void;
  onGoogle: () => void;
  onEmailAuth: (email: string, password: string, isRegistering: boolean) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <PathGlyph />
          <h1>Path101</h1>
          <p>AI-built student success operating system</p>
        </div>

        <div className="auth-list">
          <div>Goal planning, execution, habits, study support, and wellbeing in one system</div>
          <div>Dynamic dashboards generated from what the student actually needs</div>
          <div>Visual milestones, momentum tracking, and adaptive support when life gets messy</div>
        </div>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        <button className="btn btn-google btn-block" onClick={onGoogle} disabled={loading}>
          <GoogleLogo />
          Continue with Google
        </button>

        <div className="auth-divider">or</div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onEmailAuth(email, password, isRegistering);
          }}
        >
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading && <span className="spinner" />}
            {isRegistering ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="auth-footer">
          {isRegistering ? (
            <p>
              Already have an account?{" "}
              <button type="button" className="text-button" onClick={() => setIsRegistering(false)}>
                Sign in
              </button>
            </p>
          ) : (
            <p>
              New here?{" "}
              <button type="button" className="text-button" onClick={() => setIsRegistering(true)}>
                Create an account
              </button>
            </p>
          )}
        </div>

        <div className="auth-divider">or</div>

        <button className="btn btn-secondary btn-block" onClick={onAnonymous} disabled={loading}>
          Continue anonymously
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ role, text }: { role: "user" | "ai"; text: string }) {
  return (
    <div className={`chat-bubble ${role}`}>
      {role === "ai" && <span className="chat-avatar">P</span>}
      <div className="chat-text">{text}</div>
    </div>
  );
}

function MetricDial({ label, value, targetLabel, insight }: AIWorkspace["metrics"][number]) {
  return (
    <div className="metric-card">
      <div
        className="metric-dial"
        style={{ "--metric-value": `${value}%` } as CSSProperties}
      >
        <div className="metric-dial-inner">
          <span>{value}%</span>
        </div>
      </div>
      <div className="metric-copy">
        <h3>{label}</h3>
        <p>{insight}</p>
        <span>{targetLabel}</span>
      </div>
    </div>
  );
}

function ModuleCard({ module }: { module: WorkspaceModule }) {
  return (
    <article className={`module-card ${module.kind}`}>
      <div className="module-topline">
        <span className="module-kind">{module.kind}</span>
        <span className="module-tone">{module.tone}</span>
      </div>
      <h3>{module.title}</h3>
      <p>{module.description}</p>
      <ul>
        {module.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function MilestoneCard({
  milestone,
  isSelected,
  onSelect,
}: {
  milestone: WorkspaceMilestone;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`milestone-card ${isSelected ? "selected" : ""}`} onClick={onSelect}>
      <div className="milestone-topline">
        <span className={`status-pill ${milestone.status}`}>{milestone.status.replace("_", " ")}</span>
        <span>{milestone.dueLabel}</span>
      </div>
      <h3>{milestone.title}</h3>
      <p>{milestone.description}</p>
      <div className="progress-track">
        <span style={{ width: `${milestone.completionPercent}%` }} />
      </div>
      <strong>{milestone.completionPercent}% complete</strong>
    </button>
  );
}

function ActionCard({
  action,
  onStatusChange,
}: {
  action: WorkspaceAction;
  onStatusChange: (actionId: string, status: WorkspaceActionStatus) => void;
}) {
  const primaryAction =
    action.status === "done"
      ? { label: "Reopen", nextStatus: "todo" as const }
      : action.status === "in_progress"
        ? { label: "Mark done", nextStatus: "done" as const }
        : { label: "Start now", nextStatus: "in_progress" as const };

  return (
    <article className={`action-card ${action.status}`}>
      <div className="action-meta">
        <span className={`impact-pill ${action.impact}`}>{action.impact}</span>
        <span>{action.durationMins} min</span>
        <span>{action.energy} energy</span>
      </div>
      <h4>{action.title}</h4>
      <p>{action.detail}</p>
      <div className="action-footer">
        <span className={`status-pill ${action.status}`}>{action.status.replace("_", " ")}</span>
        <div className="action-buttons">
          {action.status !== "done" && (
            <button
              className="ghost-button"
              type="button"
              onClick={() => onStatusChange(action.id, "done")}
            >
              Quick complete
            </button>
          )}
          <button
            className="solid-button"
            type="button"
            onClick={() => onStatusChange(action.id, primaryAction.nextStatus)}
          >
            {primaryAction.label}
          </button>
        </div>
      </div>
    </article>
  );
}

function computeOverallProgress(workspace: AIWorkspace | null): number {
  if (!workspace || workspace.actions.length === 0) return 0;
  const doneCount = workspace.actions.filter((action) => action.status === "done").length;
  return Math.round((doneCount / workspace.actions.length) * 100);
}

function synchronizeWorkspace(workspace: AIWorkspace): AIWorkspace {
  const actions = workspace.actions;
  const completion = computeOverallProgress(workspace);
  const inProgressCount = actions.filter((action) => action.status === "in_progress").length;

  const milestones = workspace.milestones.map((milestone) => {
    const related = actions.filter((action) => action.milestoneId === milestone.id);
    const actionIds = related.map((action) => action.id);
    const doneCount = related.filter((action) => action.status === "done").length;
    const completionPercent =
      related.length > 0 ? Math.round((doneCount / related.length) * 100) : milestone.completionPercent;

    return {
      ...milestone,
      actionIds,
      completionPercent,
      status:
        completionPercent >= 100
          ? "complete"
          : completionPercent > 0 || related.some((action) => action.status === "in_progress")
            ? "active"
            : milestone.status,
    };
  });

  const metrics = workspace.metrics.map((metric, index) => {
    const lower = metric.label.toLowerCase();
    const value =
      lower.includes("execution") || lower.includes("momentum") || lower.includes("progress")
        ? Math.max(metric.value, completion)
        : index === 0
          ? Math.max(metric.value, Math.round((completion + 40) / 1.4))
          : metric.value;
    return { ...metric, value: Math.min(100, value) };
  });

  const momentumLabel =
    completion >= 70
      ? "Strong momentum and visible proof"
      : completion >= 35 || inProgressCount > 0
        ? "System is moving, keep the cadence alive"
        : "Foundations are set, first visible wins next";

  return {
    ...workspace,
    milestones,
    metrics,
    momentumLabel,
  };
}

async function loadAiService() {
  return import("./firebase/services/aiService");
}

function AppSkeleton() {
  return (
    <div className="loading-shell">
      <PathGlyph />
      <h2>Loading your student OS</h2>
      <TypingDots />
    </div>
  );
}

export function App() {
  const auth = useAuth();

  const [view, setView] = useState<View>("intake");
  const [profile, setProfile] = useState<StudentProfileInput>(emptyProfile);
  const [analysis, setAnalysis] = useState<AIStudentAnalysis | null>(null);
  const [workspace, setWorkspace] = useState<AIWorkspace | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<ProgressCheckIn[]>([]);
  const [checkInDraft, setCheckInDraft] = useState<CheckInDraft>(emptyCheckIn);
  const [progressInsight, setProgressInsight] = useState<AIProgressInsight | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const overallProgress = computeOverallProgress(workspace);
  const selectedMilestone = workspace?.milestones.find((milestone) => milestone.id === selectedMilestoneId)
    ?? workspace?.milestones[0]
    ?? null;

  const milestoneActions = useMemo(
    () =>
      selectedMilestone && workspace
        ? workspace.actions.filter((action) => action.milestoneId === selectedMilestone.id)
        : [],
    [selectedMilestone, workspace]
  );

  const actionsByLane = useMemo(
    () => ({
      today: workspace?.actions.filter((action) => action.lane === "today") ?? [],
      thisWeek: workspace?.actions.filter((action) => action.lane === "this_week") ?? [],
      support: workspace?.actions.filter((action) => action.lane === "support") ?? [],
    }),
    [workspace]
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!auth.user) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    setBootstrapping(true);

    getLatestWorkspace(auth.user.uid)
      .then((stored) => {
        if (cancelled) return;

        if (!stored) {
          setView("intake");
          setWorkspace(null);
          setWorkspaceId(null);
          setAnalysis(null);
          return;
        }

        const synced = synchronizeWorkspace(stored.workspace);
        setProfile(stored.profile);
        setAnalysis(stored.analysis);
        setWorkspace(synced);
        setWorkspaceId(stored.workspaceId);
        setSelectedMilestoneId(synced.milestones[0]?.id ?? null);
        setView("workspace");
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError((reason as Error).message ?? "Could not load your workspace.");
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth.user]);

  async function handleAnonymous() {
    setError(null);
    try {
      await auth.signInAnonymous();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await auth.signInWithGoogle();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function handleEmailAuth(email: string, password: string, isRegistering: boolean) {
    setError(null);
    try {
      if (isRegistering) {
        await auth.signUp(email, password);
      } else {
        await auth.signIn(email, password);
      }
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  function applyWorkspaceState(nextAnalysis: AIStudentAnalysis, nextWorkspace: AIWorkspace, nextWorkspaceId: string | null) {
    startTransition(() => {
      setAnalysis(nextAnalysis);
      setWorkspace(nextWorkspace);
      setWorkspaceId(nextWorkspaceId);
      setProgressInsight(null);
      setCheckIns([]);
      setSelectedMilestoneId(nextWorkspace.milestones[0]?.id ?? null);
      setView("workspace");
    });
  }

  async function handleBuildWorkspace(event: React.FormEvent) {
    event.preventDefault();

    if (!auth.user || !profile.goal.trim()) return;

    setLoading(true);
    setError(null);
    setView("generating");

    try {
      const { analyzeStudentProfile, generateWorkspace } = await loadAiService();
      const nextAnalysis = await analyzeStudentProfile(profile);

      if (nextAnalysis.safetyAlert) {
        const flagId = await addSafetyFlag(
          auth.user.uid,
          profile.currentReality || profile.goal,
          "ai_detected",
          10,
          "urgent",
          nextAnalysis.safetyAlert
        );
        await createSafetyEscalationEvent(auth.user.uid, "urgent", nextAnalysis.safetyAlert, flagId);
      }

      const nextWorkspace = synchronizeWorkspace(await generateWorkspace(profile, nextAnalysis));
      const storedWorkspaceId = await saveWorkspace(auth.user.uid, profile, nextAnalysis, nextWorkspace);

      applyWorkspaceState(nextAnalysis, nextWorkspace, storedWorkspaceId);
    } catch (reason) {
      setError((reason as Error).message);
      setView("intake");
    } finally {
      setLoading(false);
    }
  }

  async function persistWorkspace(nextWorkspace: AIWorkspace) {
    if (!workspaceId) return;
    await updateWorkspace(workspaceId, nextWorkspace);
  }

  async function handleActionStatusChange(actionId: string, status: WorkspaceActionStatus) {
    if (!workspace || !auth.user) return;

    const nextWorkspace = synchronizeWorkspace({
      ...workspace,
      actions: workspace.actions.map((action) =>
        action.id === actionId ? { ...action, status } : action
      ),
    });

    setWorkspace(nextWorkspace);

    try {
      await persistWorkspace(nextWorkspace);
      if (workspaceId) {
        await recordProgressEvent(
          auth.user.uid,
          workspaceId,
          status === "done" ? "action_completed" : "action_reopened",
          { actionId, status }
        );
      }
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function handleCheckIn(event: React.FormEvent) {
    event.preventDefault();

    if (!auth.user || !workspace || !workspaceId) return;

    const nextCheckIn: ProgressCheckIn = {
      ...checkInDraft,
      note: checkInDraft.note.trim(),
      createdAt: new Date().toISOString(),
    };

    const nextCheckIns = [...checkIns, nextCheckIn];
    setLoading(true);
    setError(null);

    try {
      const { generateProgressInsight } = await loadAiService();
      await saveCheckIn(auth.user.uid, workspaceId, nextCheckIn);
      await recordProgressEvent(auth.user.uid, workspaceId, "checkin_logged", nextCheckIn);
      const nextInsight = await generateProgressInsight(workspace, nextCheckIns);
      setCheckIns(nextCheckIns);
      setProgressInsight(nextInsight);
      setCheckInDraft(emptyCheckIn);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChat(event: React.FormEvent) {
    event.preventDefault();
    if (!chatInput.trim()) return;

    const outgoing = chatInput.trim();
    setChatInput("");
    setChatMessages((current) => [...current, { role: "user", text: outgoing }]);
    setLoading(true);

    try {
      const { chat: aiChat } = await loadAiService();
      const history = chatMessages.map((entry) => ({
        role: entry.role === "ai" ? "assistant" as const : "user" as const,
        text: entry.text,
      }));
      const reply = await aiChat(outgoing, history, workspace);
      setChatMessages((current) => [...current, { role: "ai", text: reply }]);
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          role: "ai",
          text: "The support layer is temporarily slow. Use the workspace cards for your next step and try chatting again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function resetForNewWorkspace() {
    setView("intake");
    setProfile(workspace ? profile : emptyProfile);
    setProgressInsight(null);
  }

  if (auth.loading || bootstrapping) return <AppSkeleton />;

  if (!auth.user) {
    return (
      <AuthScreen
        onAnonymous={handleAnonymous}
        onGoogle={handleGoogle}
        onEmailAuth={handleEmailAuth}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="app-bg-orb orb-a" />
      <div className="app-bg-orb orb-b" />

      <nav className="navbar">
        <button className="brand-button" type="button" onClick={() => setView(workspace ? "workspace" : "intake")}>
          <PathGlyph />
          <div>
            <strong>Path101</strong>
            <span>Student success OS</span>
          </div>
        </button>

        <div className="navbar-actions">
          {workspace && (
            <div className="progress-pill">
              <span>Overall progress</span>
              <strong>{overallProgress}%</strong>
            </div>
          )}
          <button className="nav-button" type="button" onClick={() => setView("intake")}>
            Build
          </button>
          <button className="nav-button" type="button" onClick={() => setView("chat")}>
            Chat
          </button>
          <span className="navbar-user">
            {auth.user.isAnonymous ? "Guest" : auth.user.email?.split("@")[0] ?? "Student"}
          </span>
          <button className="nav-button" type="button" onClick={auth.signOutUser}>
            Sign out
          </button>
        </div>
      </nav>

      <main className="main-content">
        {error && (
          <div className="alert alert-error" onClick={() => setError(null)}>
            ⚠️ {error}
          </div>
        )}

        {view === "intake" && (
          <div className="intake-layout">
            <section className="hero-panel">
              <div className="eyebrow">AI-generated student system</div>
              <h1>Build everything this student needs to achieve the goal.</h1>
              <p>
                Path101 should generate the right mix of planning, study structure,
                accountability, wellbeing support, and execution tools from the
                student&apos;s real situation instead of forcing them into a fixed template.
              </p>
              <div className="hero-tags">
                <span>Goals</span>
                <span>Academics</span>
                <span>Career</span>
                <span>Habits</span>
                <span>Mental health</span>
                <span>Momentum</span>
              </div>
              <div className="hero-highlights">
                <article>
                  <strong>Dynamic modules</strong>
                  <p>No predefined feature path. The AI chooses the right support blocks.</p>
                </article>
                <article>
                  <strong>Visual progress</strong>
                  <p>Milestones, momentum, and action completion stay visible every step.</p>
                </article>
                <article>
                  <strong>Smooth support</strong>
                  <p>Check-ins, recovery prompts, and strategy updates appear when they help.</p>
                </article>
              </div>
            </section>

            <section className="builder-panel">
              <div className="panel-topline">
                <div>
                  <span className="eyebrow">Goal intake</span>
                  <h2>Describe the student, not just the task.</h2>
                </div>
                {workspace && (
                  <button type="button" className="ghost-button" onClick={resetForNewWorkspace}>
                    Rebuild workspace
                  </button>
                )}
              </div>

              <form onSubmit={handleBuildWorkspace} className="builder-form">
                <div className="form-group">
                  <label className="form-label">What are you trying to achieve?</label>
                  <textarea
                    className="form-input textarea-lg"
                    aria-label="What are you trying to achieve?"
                    value={profile.goal}
                    onChange={(event) => setProfile((current) => ({ ...current, goal: event.target.value }))}
                    placeholder="Examples: crack a competitive exam, raise GPA this semester, build a portfolio for internships, recover from burnout while staying on track..."
                    required
                  />
                </div>

                <div className="form-split">
                  <div className="form-group">
                    <label className="form-label">Timeframe</label>
                    <input
                      className="form-input"
                      aria-label="Timeframe"
                      value={profile.timeframe}
                      onChange={(event) => setProfile((current) => ({ ...current, timeframe: event.target.value }))}
                      placeholder="Next 90 days"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Weekly capacity</label>
                    <input
                      className="form-input"
                      aria-label="Weekly capacity"
                      value={profile.weeklyCapacity}
                      onChange={(event) => setProfile((current) => ({ ...current, weeklyCapacity: event.target.value }))}
                      placeholder="8-10 focused hours per week"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">What does real life look like right now?</label>
                  <textarea
                    className="form-input"
                    aria-label="What does real life look like right now?"
                    value={profile.currentReality}
                    onChange={(event) => setProfile((current) => ({ ...current, currentReality: event.target.value }))}
                    placeholder="Classes, deadlines, commute, family pressure, sleep issues, distractions, part-time work, energy dips..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">What kind of support should Path101 create if needed?</label>
                  <textarea
                    className="form-input"
                    aria-label="What kind of support should Path101 create if needed?"
                    value={profile.supportNeeds}
                    onChange={(event) => setProfile((current) => ({ ...current, supportNeeds: event.target.value }))}
                    placeholder="Examples: accountability, structured study blocks, mental reset support, habit tracking, interview prep, confidence support..."
                  />
                </div>

                <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Building the workspace...
                    </>
                  ) : (
                    "Generate my Path101 workspace"
                  )}
                </button>
              </form>
            </section>
          </div>
        )}

        {view === "generating" && (
          <section className="generation-panel">
            <PathGlyph />
            <h2>Designing a custom student OS</h2>
            <p>
              Mapping the goal, pressure points, support needs, and the visual
              system this student needs to keep moving.
            </p>
            <TypingDots />
          </section>
        )}

        {view === "workspace" && workspace && analysis && (
          <>
            <section className="workspace-hero">
              <div className="workspace-copy">
                <div className="eyebrow">Generated workspace</div>
                <h1>{workspace.workspaceTitle}</h1>
                <p className="workspace-subtitle">{workspace.workspaceSubtitle}</p>
                <p className="workspace-strategy">{workspace.strategy}</p>
                <div className="hero-actions">
                  <button className="btn btn-primary" type="button" onClick={() => setView("chat")}>
                    Open AI support
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={resetForNewWorkspace}>
                    Rebuild around a new goal
                  </button>
                </div>
              </div>

              <div className="workspace-focus-card">
                <div className="focus-ring" style={{ "--focus-value": `${overallProgress}%` } as CSSProperties}>
                  <div>
                    <span>Momentum</span>
                    <strong>{overallProgress}%</strong>
                  </div>
                </div>
                <div className="focus-copy">
                  <h3>{workspace.momentumLabel}</h3>
                  <p>{workspace.northStar}</p>
                  <small>{workspace.celebrationNote}</small>
                </div>
              </div>
            </section>

            {analysis.safetyAlert && <div className="alert alert-warning">🛟 {analysis.safetyAlert}</div>}

            <section className="summary-banner">
              <div>
                <span className="eyebrow">AI read</span>
                <h2>{analysis.primaryGoal}</h2>
                <p>{analysis.summary}</p>
              </div>
              <div className="summary-columns">
                <div>
                  <strong>Priorities</strong>
                  {analysis.priorities.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div>
                  <strong>Constraints</strong>
                  {analysis.constraints.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </section>

            <section className="metric-grid">
              {workspace.metrics.map((metric) => (
                <MetricDial key={metric.id} {...metric} />
              ))}
            </section>

            <section className="workspace-grid">
              <div className="workspace-main">
                <article className="surface-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Roadmap</span>
                      <h2>Milestones with visible progress</h2>
                    </div>
                    <span className="section-meta">{workspace.milestones.length} milestone arcs</span>
                  </div>

                  <div className="milestone-grid">
                    {workspace.milestones.map((milestone) => (
                      <MilestoneCard
                        key={milestone.id}
                        milestone={milestone}
                        isSelected={selectedMilestone?.id === milestone.id}
                        onSelect={() => setSelectedMilestoneId(milestone.id)}
                      />
                    ))}
                  </div>
                </article>

                {selectedMilestone && (
                  <article className="surface-card">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">Current focus</span>
                        <h2>{selectedMilestone.title}</h2>
                      </div>
                      <span className={`status-pill ${selectedMilestone.status}`}>
                        {selectedMilestone.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="detail-copy">{selectedMilestone.description}</p>
                    <div className="outcome-list">
                      {selectedMilestone.outcomes.map((outcome) => (
                        <div key={outcome}>{outcome}</div>
                      ))}
                    </div>
                    <div className="milestone-action-strip">
                      {milestoneActions.map((action) => (
                        <div key={action.id} className={`mini-action ${action.status}`}>
                          <span>{action.title}</span>
                          <strong>{action.status.replace("_", " ")}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                )}

                <article className="surface-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Action lanes</span>
                      <h2>What to do next</h2>
                    </div>
                    <span className="section-meta">Adaptive and user-specific</span>
                  </div>

                  <div className="action-lanes">
                    <div className="lane-column">
                      <h3>Today</h3>
                      {actionsByLane.today.map((action) => (
                        <ActionCard key={action.id} action={action} onStatusChange={handleActionStatusChange} />
                      ))}
                    </div>
                    <div className="lane-column">
                      <h3>This week</h3>
                      {actionsByLane.thisWeek.map((action) => (
                        <ActionCard key={action.id} action={action} onStatusChange={handleActionStatusChange} />
                      ))}
                    </div>
                    <div className="lane-column">
                      <h3>Support</h3>
                      {actionsByLane.support.map((action) => (
                        <ActionCard key={action.id} action={action} onStatusChange={handleActionStatusChange} />
                      ))}
                    </div>
                  </div>
                </article>

                <article className="surface-card">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Generated modules</span>
                      <h2>The system Path101 composed for this student</h2>
                    </div>
                  </div>
                  <div className="module-grid">
                    {workspace.modules.map((module) => (
                      <ModuleCard key={module.id} module={module} />
                    ))}
                  </div>
                </article>
              </div>

              <aside className="workspace-side">
                <article className="surface-card side-card">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">Energy map</span>
                      <h2>How Path101 is pacing this</h2>
                    </div>
                  </div>
                  <p className="detail-copy">{analysis.energyProfile}</p>
                  {analysis.mentalHealthConsiderations.length > 0 && (
                    <div className="mini-list">
                      {analysis.mentalHealthConsiderations.map((note) => (
                        <div key={note}>{note}</div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="surface-card side-card">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">Check-in</span>
                      <h2>Log the current state</h2>
                    </div>
                  </div>

                  <form className="checkin-form" onSubmit={handleCheckIn}>
                    <label>
                      <span>Energy</span>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={checkInDraft.energy}
                        onChange={(event) =>
                          setCheckInDraft((current) => ({ ...current, energy: Number(event.target.value) }))
                        }
                      />
                      <strong>{checkInDraft.energy}/5</strong>
                    </label>
                    <label>
                      <span>Focus</span>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={checkInDraft.focus}
                        onChange={(event) =>
                          setCheckInDraft((current) => ({ ...current, focus: Number(event.target.value) }))
                        }
                      />
                      <strong>{checkInDraft.focus}/5</strong>
                    </label>
                    <label>
                      <span>Stress</span>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={checkInDraft.stress}
                        onChange={(event) =>
                          setCheckInDraft((current) => ({ ...current, stress: Number(event.target.value) }))
                        }
                      />
                      <strong>{checkInDraft.stress}/5</strong>
                    </label>
                    <textarea
                      className="form-input"
                      value={checkInDraft.note}
                      onChange={(event) => setCheckInDraft((current) => ({ ...current, note: event.target.value }))}
                      placeholder="What is helping or blocking momentum today?"
                    />
                    <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                      {loading ? "Thinking..." : "Generate adjustment"}
                    </button>
                  </form>
                </article>

                <article className="surface-card side-card">
                  <div className="section-heading compact">
                    <div>
                      <span className="eyebrow">Checkpoint prompts</span>
                      <h2>Review rhythm</h2>
                    </div>
                  </div>
                  <div className="checkpoint-stack">
                    {workspace.checkIns.map((checkIn) => (
                      <div key={checkIn.id} className="checkpoint-card">
                        <strong>{checkIn.title}</strong>
                        <span>{checkIn.frequency}</span>
                        {checkIn.prompts.map((prompt) => (
                          <div key={prompt}>{prompt}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>

                {progressInsight && (
                  <article className="surface-card side-card insight-card">
                    <div className="section-heading compact">
                      <div>
                        <span className="eyebrow">Adaptive insight</span>
                        <h2>{progressInsight.headline}</h2>
                      </div>
                    </div>
                    <p className="detail-copy">{progressInsight.momentum}</p>
                    <div className="mini-list">
                      {progressInsight.wins.map((win) => (
                        <div key={win}>{win}</div>
                      ))}
                    </div>
                    <div className="mini-list warning">
                      {progressInsight.friction.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                    <div className="next-move">{progressInsight.nextMove}</div>
                  </article>
                )}
              </aside>
            </section>
          </>
        )}

        {view === "chat" && (
          <section className="chat-shell">
            <div className="surface-card chat-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Path101 support layer</span>
                  <h2>Ask for planning, strategy, or a reset</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => setView(workspace ? "workspace" : "intake")}>
                  Back to workspace
                </button>
              </div>

              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <div className="chat-empty">
                    <PathGlyph />
                    <p>
                      Ask Path101 to rethink the roadmap, simplify the next step,
                      build a study strategy, or help when stress is affecting execution.
                    </p>
                  </div>
                )}
                {chatMessages.map((message, index) => (
                  <ChatBubble key={`${message.role}-${index}`} role={message.role} text={message.text} />
                ))}
                {loading && (
                  <div className="chat-bubble ai">
                    <span className="chat-avatar">P</span>
                    <TypingDots />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form className="chat-input-row" onSubmit={handleChat}>
                <input
                  className="form-input"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask Path101 what should happen next..."
                  disabled={loading}
                />
                <button className="btn btn-primary" type="submit" disabled={loading || !chatInput.trim()}>
                  Send
                </button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
