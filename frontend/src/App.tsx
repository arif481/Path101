import { useState } from "react";
import { useAuth } from "./firebase/useAuth";
import { compilePlan, computeReward, type PlanPreview } from "./firebase/services/intakeService";
import { evaluateSafetyText } from "./firebase/services/safetyService";
import { selectNextRecommendation, type BanditResult } from "./firebase/services/banditService";
import {
  savePlan,
  addSafetyFlag,
  createSafetyEscalationEvent,
  completeSession as firestoreCompleteSession,
  addBanditLog,
  enqueueTask,
} from "./firebase/services/firestoreOps";

/* ── Google logo SVG ───────────────────────────────── */

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/* ── Auth screen ───────────────────────────────────── */

function AuthScreen({
  onAnonymous,
  onGoogle,
  onEmailAuth,
  loading,
  error,
}: {
  onAnonymous: () => void;
  onGoogle: () => void;
  onEmailAuth: (email: string, password: string, isRegister: boolean) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onEmailAuth(email, password, isRegister);
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo">🧭</div>
          <h1>Path101</h1>
          <p>Your personal behavior-change companion</p>
        </div>

        {error && <div className="alert alert-error">⚠️ {error}</div>}

        <button className="btn btn-google btn-block" onClick={onGoogle} disabled={loading}>
          <GoogleLogo />
          Continue with Google
        </button>

        <div className="auth-divider">or</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading && <span className="spinner" />}
            {isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="auth-footer">
          {isRegister ? (
            <p>Already have an account?{" "}<a onClick={() => setIsRegister(false)}>Sign in</a></p>
          ) : (
            <p>Don&apos;t have an account?{" "}<a onClick={() => setIsRegister(true)}>Create one</a></p>
          )}
        </div>

        <div className="auth-divider">or</div>

        <button className="btn btn-secondary btn-block btn-sm" onClick={onAnonymous} disabled={loading}>
          👤 Continue anonymously
        </button>
      </div>
    </div>
  );
}

/* ── Plan Preview card ─────────────────────────────── */

function PlanPreviewCard({ plan, smartGoal, safetyTriggered, triageMessage }: {
  plan: PlanPreview;
  smartGoal: string;
  safetyTriggered: boolean;
  triageMessage: string | null;
}) {
  const session = plan.nextSession;

  return (
    <div className="card">
      <div className="card-header">
        <div className="icon purple">📋</div>
        <div>
          <div className="card-title">Your Plan</div>
          <div className="card-subtitle">Week {plan.currentWeek} of {plan.durationWeeks}</div>
        </div>
      </div>

      {safetyTriggered && triageMessage && (
        <div className="safety-banner">
          <p>🛡️ {triageMessage}</p>
        </div>
      )}

      <div className="smart-goal">💡 {smartGoal}</div>

      <div className="pill-row">
        {plan.modules.map((mod) => (
          <span key={mod} className="pill">{mod.replace(/_/g, " ")}</span>
        ))}
      </div>

      <div className="plan-grid">
        <div className="plan-stat">
          <div className="label">Next Session</div>
          <div className="value">{session.title}</div>
        </div>
        <div className="plan-stat">
          <div className="label">Duration</div>
          <div className="value">{session.durationMins} min</div>
        </div>
        <div className="plan-stat">
          <div className="label">Difficulty</div>
          <div className="value">
            <span className={`badge badge-${session.difficulty === "low" ? "green" : session.difficulty === "medium" ? "yellow" : "red"}`}>
              {session.difficulty}
            </span>
          </div>
        </div>
        <div className="plan-stat">
          <div className="label">Metrics</div>
          <div className="value" style={{ fontSize: 13 }}>
            {session.expectedMetrics.join(", ")}
          </div>
        </div>
      </div>

      <div className="session-steps">
        {session.steps.map((step, i) => (
          <div key={i} className="step-item">
            <div className="step-number">{i + 1}</div>
            <div className="step-title">{step.title}</div>
            <div className="step-duration">{step.durationMins}m</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Session Completion + Reward ───────────────────── */

function RewardCard({ result }: { result: BanditResult & { reward: number } }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="icon green">🏆</div>
        <div>
          <div className="card-title">Session Complete!</div>
          <div className="card-subtitle">Here's your reward and next recommendation</div>
        </div>
      </div>

      <div className="reward-display">
        <div>
          <div className="reward-label">Reward Score</div>
          <div className="reward-score">{result.reward.toFixed(2)}</div>
        </div>
        <div className="reward-rationale">{result.rationale}</div>
      </div>

      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>NEXT RECOMMENDATION</p>
        <div className="step-item">
          <div className="step-number">→</div>
          <div className="step-title">{result.plan.title}</div>
          <div className="step-duration">{result.plan.durationMins}m</div>
        </div>
        <div style={{ marginTop: 8 }}>
          <span className={`badge badge-${result.plan.difficulty === "low" ? "green" : result.plan.difficulty === "medium" ? "yellow" : "red"}`}>
            {result.plan.difficulty}
          </span>
          <span className="badge badge-purple" style={{ marginLeft: 6 }}>{result.policyVersion}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main App ──────────────────────────────────────── */

export function App() {
  const auth = useAuth();
  const [view, setView] = useState<"intake" | "complete">("intake");
  const [text, setText] = useState("");
  const [availableTimes, setAvailableTimes] = useState("7-9pm weekdays");
  const [preMood, setPreMood] = useState(5);
  const [postMood, setPostMood] = useState(6);
  const [feedback, setFeedback] = useState("");
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [smartGoal, setSmartGoal] = useState("");
  const [safetyTriggered, setSafetyTriggered] = useState(false);
  const [triageMessage, setTriageMessage] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<(BanditResult & { reward: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Auth handlers ─────────────────────────────────

  async function handleAnonymous() {
    setError(null);
    try { await auth.signInAnonymous(); } catch (e) { setError((e as Error).message); }
  }

  async function handleGoogle() {
    setError(null);
    try { await auth.signInWithGoogle(); } catch (e) { setError((e as Error).message); }
  }

  async function handleEmailAuth(email: string, password: string, isRegister: boolean) {
    setError(null);
    try {
      if (isRegister) { await auth.signUp(email, password); }
      else { await auth.signIn(email, password); }
    } catch (e) { setError((e as Error).message); }
  }

  // ── Show auth screen if not logged in ─────────────

  if (!auth.user) {
    return (
      <AuthScreen
        onAnonymous={handleAnonymous}
        onGoogle={handleGoogle}
        onEmailAuth={handleEmailAuth}
        loading={auth.loading}
        error={error}
      />
    );
  }

  // ── Intake handler ────────────────────────────────

  async function handleIntake(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.user) return;
    setLoading(true);
    setError(null);
    setSessionResult(null);

    try {
      const triage = evaluateSafetyText(text);
      const { plan: newPlan, smartGoal: goal } = compilePlan(
        auth.user.uid, text,
        availableTimes.split(",").map(s => s.trim()).filter(Boolean)
      );

      if (triage.triggered) {
        setSafetyTriggered(true);
        setTriageMessage(triage.triageMessage);
        const flagId = await addSafetyFlag(
          auth.user.uid, text, triage.triggerType,
          triage.severityScore, triage.escalationStatus, triage.triageMessage
        );
        if (triage.escalationStatus === "escalated" || triage.escalationStatus === "urgent") {
          await createSafetyEscalationEvent(auth.user.uid, triage.escalationStatus, triage.triageMessage, flagId);
        }
      } else {
        setSafetyTriggered(false);
        setTriageMessage(null);
        await savePlan(auth.user.uid, newPlan);
        await enqueueTask("schedule_session_nudge", auth.user.uid, {
          session_id: newPlan.nextSession.sessionId,
          scheduled_at: newPlan.nextSession.scheduledAt,
        });
      }

      setPlan(newPlan);
      setSmartGoal(goal);
      setView("complete");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Session complete handler ──────────────────────

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.user || !plan) return;
    setLoading(true);
    setError(null);

    try {
      const sessionId = plan.nextSession.sessionId;
      await firestoreCompleteSession(sessionId, preMood, postMood, feedback);

      const reward = computeReward(preMood, postMood, false);
      const bandit = await selectNextRecommendation(auth.user.uid, sessionId, feedback);

      await addBanditLog(
        auth.user.uid,
        { pre_mood: preMood, post_mood: postMood, source: "worker_queue" },
        bandit.actionId, bandit.policyVersion, reward
      );

      await enqueueTask("session_completed", auth.user.uid, {
        session_id: sessionId, action_id: bandit.actionId,
        reward, pre_mood: preMood, post_mood: postMood,
      });

      setSessionResult({ ...bandit, reward });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Render main app ───────────────────────────────

  return (
    <div className="app-shell">
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="logo">🧭</div>
          Path101
        </div>
        <div className="navbar-right">
          <span className="navbar-user">
            {auth.user.isAnonymous ? "👤 Anonymous" : auth.user.email ?? auth.user.uid.slice(0, 8)}
          </span>
          {auth.isAdmin && <span className="badge badge-purple">Admin</span>}
          <button className="btn btn-ghost btn-sm" onClick={auth.signOutUser}>Sign out</button>
        </div>
      </nav>

      <main className="main-content">
        {error && <div className="alert alert-error">⚠️ {error}</div>}

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab ${view === "intake" ? "active" : ""}`} onClick={() => setView("intake")}>
            📝 New Plan
          </button>
          <button
            className={`tab ${view === "complete" ? "active" : ""}`}
            onClick={() => setView("complete")}
            disabled={!plan}
          >
            ✅ Complete Session
          </button>
        </div>

        {/* ── Intake form ──────────────────────────── */}
        {view === "intake" && (
          <div className="card">
            <div className="card-header">
              <div className="icon purple">📝</div>
              <div>
                <div className="card-title">Tell us what&apos;s going on</div>
                <div className="card-subtitle">We&apos;ll create a personalized micro-session plan for you</div>
              </div>
            </div>

            <form onSubmit={handleIntake}>
              <div className="form-group">
                <label className="form-label">What&apos;s been challenging you lately?</label>
                <textarea
                  className="form-input"
                  placeholder="e.g., I keep delaying my assignments and feel anxious about exams..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">When are you free? (comma-separated)</label>
                <input
                  className="form-input"
                  placeholder="7-9pm weekdays, Saturday mornings"
                  value={availableTimes}
                  onChange={(e) => setAvailableTimes(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? <span className="spinner" /> : "🚀"} Generate My Plan
              </button>
            </form>
          </div>
        )}

        {/* ── Plan preview ─────────────────────────── */}
        {plan && view === "complete" && (
          <>
            <PlanPreviewCard
              plan={plan}
              smartGoal={smartGoal}
              safetyTriggered={safetyTriggered}
              triageMessage={triageMessage}
            />

            {/* ── Session complete form ──────────── */}
            {!sessionResult && (
              <div className="card">
                <div className="card-header">
                  <div className="icon green">✅</div>
                  <div>
                    <div className="card-title">Complete This Session</div>
                    <div className="card-subtitle">Record your mood and get your next recommendation</div>
                  </div>
                </div>

                <form onSubmit={handleComplete}>
                  <div className="form-group">
                    <label className="form-label">Pre-Session Mood</label>
                    <div className="mood-row">
                      <span>😔</span>
                      <input
                        className="mood-slider"
                        type="range" min={1} max={10} value={preMood}
                        onChange={(e) => setPreMood(Number(e.target.value))}
                      />
                      <span className="mood-value">{preMood}</span>
                      <span>😊</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Post-Session Mood</label>
                    <div className="mood-row">
                      <span>😔</span>
                      <input
                        className="mood-slider"
                        type="range" min={1} max={10} value={postMood}
                        onChange={(e) => setPostMood(Number(e.target.value))}
                      />
                      <span className="mood-value">{postMood}</span>
                      <span>😊</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">How did it go?</label>
                    <textarea
                      className="form-input"
                      placeholder="Share your experience..."
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                  </div>

                  <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                    {loading ? <span className="spinner" /> : "🏆"} Complete & Get Reward
                  </button>
                </form>
              </div>
            )}

            {/* ── Reward ───────────────────────────── */}
            {sessionResult && <RewardCard result={sessionResult} />}
          </>
        )}
      </main>
    </div>
  );
}
