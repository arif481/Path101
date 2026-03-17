import { useState, useRef, useEffect } from "react";
import { useAuth } from "./firebase/useAuth";
import {
  analyzeUserInput,
  generatePlan,
  generateReflection,
  generateProgressInsight,
  generateStepGuidance,
  chat as aiChat,
  type AIAnalysis,
  type AIPlan,
  type AISession,
  type AIReflection,
  type AIProgressInsight,
} from "./firebase/services/aiService";
import {
  savePlan,
  getLatestPlan,
  completeSession as firestoreCompleteSession,
  addSafetyFlag,
  createSafetyEscalationEvent,
  enqueueTask,
} from "./firebase/services/firestoreOps";

/* ── Google logo ───────────────────────────────────── */
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

/* ── Typing indicator ──────────────────────────────── */
function TypingDots() {
  return (
    <div className="typing-dots">
      <span /><span /><span />
    </div>
  );
}

/* ── Step type icon ────────────────────────────────── */
function stepIcon(type: string) {
  const map: Record<string, string> = {
    exercise: "🏃", reflection: "🪞", action: "⚡", breathing: "🌬️",
    journaling: "📝", learning: "📚",
  };
  return map[type] ?? "✨";
}

/* ── Auth Screen ───────────────────────────────────── */
function AuthScreen({ onAnonymous, onGoogle, onEmailAuth, loading, error }: {
  onAnonymous: () => void; onGoogle: () => void;
  onEmailAuth: (e: string, p: string, r: boolean) => void;
  loading: boolean; error: string | null;
}) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [isReg, setIsReg] = useState(false);
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo">🧭</div><h1>Path101</h1>
          <p>AI-powered personal growth companion</p>
        </div>
        {error && <div className="alert alert-error">⚠️ {error}</div>}
        <button className="btn btn-google btn-block" onClick={onGoogle} disabled={loading}>
          <GoogleLogo /> Continue with Google
        </button>
        <div className="auth-divider">or</div>
        <form onSubmit={e => { e.preventDefault(); onEmailAuth(email, pw, isReg); }}>
          <div className="form-group"><label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} /></div>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading && <span className="spinner" />} {isReg ? "Create Account" : "Sign In"}
          </button>
        </form>
        <div className="auth-footer">
          {isReg ? <p>Already have an account? <a onClick={() => setIsReg(false)}>Sign in</a></p>
                 : <p>Don&apos;t have an account? <a onClick={() => setIsReg(true)}>Create one</a></p>}
        </div>
        <div className="auth-divider">or</div>
        <button className="btn btn-secondary btn-block btn-sm" onClick={onAnonymous} disabled={loading}>👤 Continue anonymously</button>
      </div>
    </div>
  );
}

/* ── Chat message bubble ─────────────────────────── */
function ChatBubble({ role, text }: { role: "user" | "ai"; text: string }) {
  return (
    <div className={`chat-bubble ${role}`}>
      {role === "ai" && <span className="chat-avatar">🧭</span>}
      <div className="chat-text">{text}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  MAIN APP                                          */
/* ═══════════════════════════════════════════════════ */

type View = "home" | "analyzing" | "plan" | "session" | "reflection" | "progress" | "chat";

export function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>("home");
  const [text, setText] = useState("");
  const [times, setTimes] = useState("");
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [activeSession, setActiveSession] = useState<AISession | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [stepGuidance, setStepGuidance] = useState<string | null>(null);
  const [preMood, setPreMood] = useState(5);
  const [postMood, setPostMood] = useState(6);
  const [feedback, setFeedback] = useState("");
  const [reflection, setReflection] = useState<AIReflection | null>(null);
  const [progressInsight, setProgressInsight] = useState<AIProgressInsight | null>(null);
  const [completedSessions, setCompletedSessions] = useState<Array<{
    title: string; preMood: number; postMood: number; feedback: string; completedAt: string;
  }>>([]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── Auth ─────────────────────────────────────────
  async function handleAnonymous() { setError(null); try { await auth.signInAnonymous(); } catch (e) { setError((e as Error).message); } }
  async function handleGoogle() { setError(null); try { await auth.signInWithGoogle(); } catch (e) { setError((e as Error).message); } }
  async function handleEmailAuth(email: string, pw: string, isReg: boolean) {
    setError(null); try { isReg ? await auth.signUp(email, pw) : await auth.signIn(email, pw); } catch (e) { setError((e as Error).message); }
  }

  if (!auth.user) return <AuthScreen onAnonymous={handleAnonymous} onGoogle={handleGoogle} onEmailAuth={handleEmailAuth} loading={auth.loading} error={error} />;

  // ── AI Intake ────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!auth.user || !text.trim()) return;
    setLoading(true); setError(null); setView("analyzing");
    try {
      const pastCtx = completedSessions.length > 0
        ? completedSessions.map(s => `${s.title}: mood ${s.preMood}→${s.postMood}`).join("; ")
        : undefined;
      const result = await analyzeUserInput(text, pastCtx);
      setAnalysis(result);

      if (result.severity === "crisis") {
        await addSafetyFlag(auth.user.uid, text, "ai_detected", 10, "urgent", result.safetyAlert ?? "Crisis detected");
        await createSafetyEscalationEvent(auth.user.uid, "urgent", result.safetyAlert ?? "AI crisis detection", "");
      }

      const planResult = await generatePlan(result, times ? times.split(",").map(s => s.trim()) : ["flexible"]);
      setPlan(planResult);
      setView("plan");
    } catch (e) { setError((e as Error).message); setView("home"); } finally { setLoading(false); }
  }

  // ── Start session ────────────────────────────────
  async function startSession(session: AISession) {
    setActiveSession(session); setActiveStepIdx(0); setStepGuidance(null);
    setPreMood(5); setPostMood(6); setFeedback(""); setView("session");
    setLoading(true);
    try {
      const guidance = await generateStepGuidance(session.steps[0], session.description, 5);
      setStepGuidance(guidance);
    } catch { setStepGuidance(null); } finally { setLoading(false); }
  }

  // ── Navigate steps ───────────────────────────────
  async function goToStep(idx: number) {
    if (!activeSession) return;
    setActiveStepIdx(idx); setStepGuidance(null); setLoading(true);
    try {
      const guidance = await generateStepGuidance(activeSession.steps[idx], activeSession.description, preMood);
      setStepGuidance(guidance);
    } catch { setStepGuidance(null); } finally { setLoading(false); }
  }

  // ── Complete session ─────────────────────────────
  async function handleComplete() {
    if (!activeSession || !auth.user) return;
    setLoading(true); setError(null);
    try {
      const ref = await generateReflection(activeSession.title, preMood, postMood, feedback, completedSessions.length);
      setReflection(ref);
      setCompletedSessions(prev => [...prev, {
        title: activeSession.title, preMood, postMood, feedback, completedAt: new Date().toISOString(),
      }]);
      await firestoreCompleteSession(activeSession.id, preMood, postMood, feedback);
      setView("reflection");
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  // ── Progress insight ─────────────────────────────
  async function showProgress() {
    if (completedSessions.length === 0) { setError("Complete at least one session first."); return; }
    setLoading(true); setError(null);
    try {
      const insight = await generateProgressInsight(completedSessions);
      setProgressInsight(insight); setView("progress");
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  // ── AI Chat ──────────────────────────────────────
  async function handleChat(e: React.FormEvent) {
    e.preventDefault(); if (!chatInput.trim()) return;
    const msg = chatInput.trim(); setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const history = chatMessages.map(m => ({ role: m.role === "ai" ? "assistant" as const : "user" as const, text: m.text }));
      const reply = await aiChat(msg, history);
      setChatMessages(prev => [...prev, { role: "ai", text: reply }]);
    } catch { setChatMessages(prev => [...prev, { role: "ai", text: "I'm having trouble connecting right now. Please try again." }]); }
    finally { setLoading(false); }
  }

  // ── Render ───────────────────────────────────────
  return (
    <div className="app-shell">
      <nav className="navbar">
        <div className="navbar-brand" onClick={() => setView("home")} style={{ cursor: "pointer" }}>
          <div className="logo">🧭</div> Path101
        </div>
        <div className="navbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setView("home")}>🏠 Home</button>
          {completedSessions.length > 0 && <button className="btn btn-ghost btn-sm" onClick={showProgress}>📊 Progress</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => { setChatMessages([]); setView("chat"); }}>💬 Chat</button>
          <span className="navbar-user">{auth.user.isAnonymous ? "👤" : auth.user.email?.split("@")[0] ?? "User"}</span>
          <button className="btn btn-ghost btn-sm" onClick={auth.signOutUser}>Sign out</button>
        </div>
      </nav>

      <main className="main-content">
        {error && <div className="alert alert-error" onClick={() => setError(null)}>⚠️ {error} <span style={{ marginLeft: "auto", cursor: "pointer" }}>✕</span></div>}

        {/* ── HOME ─────────────────────────────── */}
        {view === "home" && (
          <>
            <div className="card hero-card">
              <h2>What&apos;s on your mind?</h2>
              <p className="card-subtitle">Tell me anything — I&apos;ll understand your situation and create a plan built just for you.</p>
              <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
                <div className="form-group">
                  <textarea className="form-input" placeholder="I've been struggling with procrastination... I can't seem to focus on my studies... I feel overwhelmed by deadlines..." value={text} onChange={e => setText(e.target.value)} required style={{ minHeight: 120 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">When are you free? (optional)</label>
                  <input className="form-input" placeholder="e.g., evenings, weekends, mornings before class" value={times} onChange={e => setTimes(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                  {loading ? <><span className="spinner" /> Thinking...</> : "✨ Analyze & Create My Plan"}
                </button>
              </form>
            </div>

            {/* Quick actions */}
            {plan && (
              <div className="card">
                <div className="card-header"><div className="icon purple">📋</div>
                  <div><div className="card-title">Your Active Plan</div><div className="card-subtitle">{plan.title}</div></div>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>{plan.approach}</p>
                <div className="session-steps">
                  {plan.sessions.map((s, i) => (
                    <div key={s.id} className="step-item" onClick={() => startSession(s)} style={{ cursor: "pointer" }}>
                      <div className="step-number">{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div className="step-title">{s.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.description}</div>
                      </div>
                      <span className={`badge badge-${s.difficulty === "gentle" ? "green" : s.difficulty === "moderate" ? "yellow" : "red"}`}>{s.difficulty}</span>
                      <div className="step-duration">{s.durationMins}m</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed sessions summary */}
            {completedSessions.length > 0 && (
              <div className="card">
                <div className="card-header"><div className="icon green">✅</div>
                  <div><div className="card-title">Completed Sessions</div><div className="card-subtitle">{completedSessions.length} sessions done</div></div>
                </div>
                <div className="mood-trend">
                  {completedSessions.slice(-5).map((s, i) => (
                    <div key={i} className="mood-trend-item">
                      <span className="mood-trend-label">{s.title.slice(0, 20)}</span>
                      <span className="mood-trend-bar">
                        <span className="mood-bar-pre" style={{ width: `${s.preMood * 10}%` }} />
                        <span className="mood-bar-post" style={{ width: `${s.postMood * 10}%` }} />
                      </span>
                      <span className={`mood-trend-change ${s.postMood >= s.preMood ? "up" : "down"}`}>
                        {s.postMood >= s.preMood ? "↑" : "↓"}{Math.abs(s.postMood - s.preMood)}
                      </span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary btn-block btn-sm" onClick={showProgress} style={{ marginTop: 12 }}>📊 See AI Progress Insight</button>
              </div>
            )}
          </>
        )}

        {/* ── ANALYZING ────────────────────────── */}
        {view === "analyzing" && (
          <div className="card" style={{ textAlign: "center", padding: 60 }}>
            <div className="spinner" style={{ width: 40, height: 40, margin: "0 auto 20px", borderWidth: 3 }} />
            <h3>Understanding your situation...</h3>
            <p className="card-subtitle">Analyzing your concerns and crafting a personalized plan</p>
          </div>
        )}

        {/* ── PLAN ─────────────────────────────── */}
        {view === "plan" && plan && (
          <>
            {analysis && (
              <div className="card">
                <div className="card-header"><div className="icon purple">🧠</div>
                  <div><div className="card-title">Here&apos;s what I understand</div><div className="card-subtitle">{analysis.emotionalState}</div></div>
                  <span className={`badge badge-${analysis.severity === "low" ? "green" : analysis.severity === "medium" ? "yellow" : "red"}`}>{analysis.severity}</span>
                </div>
                <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>{analysis.summary}</p>
                {analysis.safetyAlert && <div className="safety-banner"><p>🛡️ {analysis.safetyAlert}</p></div>}
                <div className="pill-row" style={{ marginTop: 12 }}>{analysis.concerns.map((c, i) => <span key={i} className="pill">{c}</span>)}</div>
                <div className="smart-goal">💡 {analysis.suggestedApproach}</div>
              </div>
            )}

            <div className="card">
              <div className="card-header"><div className="icon green">📋</div>
                <div><div className="card-title">{plan.title}</div><div className="card-subtitle">{plan.goal}</div></div>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>{plan.approach}</p>
              <div className="plan-grid">
                <div className="plan-stat"><div className="label">Duration</div><div className="value">{plan.totalWeeks} weeks</div></div>
                <div className="plan-stat"><div className="label">Frequency</div><div className="value">{plan.sessionsPerWeek}x / week</div></div>
              </div>
              <h4 style={{ marginTop: 20, marginBottom: 12, fontSize: 14, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Your Sessions</h4>
              <div className="session-steps">
                {plan.sessions.map((s, i) => (
                  <div key={s.id} className="step-item" onClick={() => startSession(s)} style={{ cursor: "pointer" }}>
                    <div className="step-number">{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div className="step-title">{s.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.description}</div>
                    </div>
                    <span className={`badge badge-${s.difficulty === "gentle" ? "green" : s.difficulty === "moderate" ? "yellow" : "red"}`}>{s.difficulty}</span>
                    <div className="step-duration">{s.durationMins}m →</div>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-secondary btn-block" onClick={() => setView("home")}>← Back to Home</button>
          </>
        )}

        {/* ── SESSION ──────────────────────────── */}
        {view === "session" && activeSession && (
          <div className="card">
            <div className="card-header"><div className="icon purple">{stepIcon(activeSession.steps[activeStepIdx]?.type ?? "exercise")}</div>
              <div><div className="card-title">{activeSession.title}</div>
                <div className="card-subtitle">Step {activeStepIdx + 1} of {activeSession.steps.length}</div></div>
            </div>

            {/* Step progress */}
            <div className="step-progress">
              {activeSession.steps.map((_, i) => (
                <div key={i} className={`step-dot ${i === activeStepIdx ? "active" : i < activeStepIdx ? "done" : ""}`} onClick={() => goToStep(i)} />
              ))}
            </div>

            <div style={{ marginTop: 20 }}>
              <h3 style={{ marginBottom: 8 }}>{activeSession.steps[activeStepIdx]?.title}</h3>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
                {activeSession.steps[activeStepIdx]?.description}
              </p>
              {loading && <TypingDots />}
              {stepGuidance && (
                <div className="ai-guidance">
                  <span className="ai-guidance-label">🧭 AI Guidance</span>
                  <p>{stepGuidance}</p>
                </div>
              )}
            </div>

            <div className="btn-group" style={{ marginTop: 20 }}>
              {activeStepIdx > 0 && <button className="btn btn-secondary" onClick={() => goToStep(activeStepIdx - 1)}>← Previous</button>}
              {activeStepIdx < activeSession.steps.length - 1 ? (
                <button className="btn btn-primary" onClick={() => goToStep(activeStepIdx + 1)} style={{ marginLeft: "auto" }}>Next Step →</button>
              ) : (
                <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
                  <div className="form-group"><label className="form-label">Pre-Session Mood</label>
                    <div className="mood-row"><span>😔</span><input className="mood-slider" type="range" min={1} max={10} value={preMood} onChange={e => setPreMood(Number(e.target.value))} /><span className="mood-value">{preMood}</span><span>😊</span></div></div>
                  <div className="form-group"><label className="form-label">Post-Session Mood</label>
                    <div className="mood-row"><span>😔</span><input className="mood-slider" type="range" min={1} max={10} value={postMood} onChange={e => setPostMood(Number(e.target.value))} /><span className="mood-value">{postMood}</span><span>😊</span></div></div>
                  <div className="form-group"><label className="form-label">How did it go?</label>
                    <textarea className="form-input" placeholder="Share your experience..." value={feedback} onChange={e => setFeedback(e.target.value)} /></div>
                  <button className="btn btn-primary btn-block" onClick={handleComplete} disabled={loading}>
                    {loading ? <><span className="spinner" /> Generating reflection...</> : "🏆 Complete & Get Reflection"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REFLECTION ───────────────────────── */}
        {view === "reflection" && reflection && (
          <div className="card">
            <div className="card-header"><div className="icon green">🏆</div>
              <div><div className="card-title">Session Complete!</div><div className="card-subtitle">Here&apos;s your personalized reflection</div></div>
            </div>
            <div className="reward-display">
              <div><div className="reward-label">Mood Change</div>
                <div className="reward-score">{postMood >= preMood ? "+" : ""}{postMood - preMood}</div></div>
              <div className="reward-rationale">{reflection.moodInterpretation}</div>
            </div>
            <div className="ai-guidance" style={{ marginTop: 16 }}>
              <span className="ai-guidance-label">💡 Insight</span><p>{reflection.insight}</p>
            </div>
            <div className="ai-guidance" style={{ marginTop: 12 }}>
              <span className="ai-guidance-label">💪 Encouragement</span><p>{reflection.encouragement}</p>
            </div>
            <div className="ai-guidance" style={{ marginTop: 12 }}>
              <span className="ai-guidance-label">➡️ Next Steps</span><p>{reflection.nextSteps}</p>
            </div>
            {reflection.journalPrompts.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>JOURNAL PROMPTS</p>
                {reflection.journalPrompts.map((p, i) => (
                  <div key={i} className="step-item"><div className="step-number">✍️</div><div className="step-title">{p}</div></div>
                ))}
              </div>
            )}
            <div className="btn-group" style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={() => setView("home")}>🏠 Home</button>
              {completedSessions.length >= 2 && <button className="btn btn-secondary" onClick={showProgress}>📊 See Progress</button>}
            </div>
          </div>
        )}

        {/* ── PROGRESS ─────────────────────────── */}
        {view === "progress" && progressInsight && (
          <div className="card">
            <div className="card-header"><div className="icon purple">📊</div>
              <div><div className="card-title">Your Progress</div><div className="card-subtitle">{completedSessions.length} sessions completed</div></div>
            </div>
            <div className="ai-guidance"><span className="ai-guidance-label">📈 Overall</span><p>{progressInsight.overallProgress}</p></div>
            <div className="ai-guidance" style={{ marginTop: 12 }}><span className="ai-guidance-label">😊 Mood Trend</span><p>{progressInsight.moodTrend}</p></div>
            <div className="plan-grid" style={{ marginTop: 16 }}>
              <div className="plan-stat"><div className="label">Strengths</div>
                {progressInsight.strengths.map((s, i) => <div key={i} style={{ fontSize: 14, marginTop: 4 }}>✅ {s}</div>)}</div>
              <div className="plan-stat"><div className="label">Focus Areas</div>
                {progressInsight.areasToFocus.map((a, i) => <div key={i} style={{ fontSize: 14, marginTop: 4 }}>🎯 {a}</div>)}</div>
            </div>
            <div className="smart-goal" style={{ marginTop: 16 }}>💡 {progressInsight.recommendation}</div>
            <button className="btn btn-secondary btn-block" onClick={() => setView("home")} style={{ marginTop: 16 }}>← Back to Home</button>
          </div>
        )}

        {/* ── CHAT ─────────────────────────────── */}
        {view === "chat" && (
          <div className="card chat-container">
            <div className="card-header"><div className="icon purple">💬</div>
              <div><div className="card-title">Talk to Path101</div><div className="card-subtitle">Ask anything — I&apos;m here to help</div></div>
            </div>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                  <p style={{ fontSize: 32, marginBottom: 8 }}>🧭</p>
                  <p>Hi! I&apos;m Path101. You can ask me anything about managing stress, building better habits, dealing with procrastination, or anything else on your mind.</p>
                </div>
              )}
              {chatMessages.map((m, i) => <ChatBubble key={i} role={m.role === "ai" ? "ai" : "user"} text={m.text} />)}
              {loading && <div className="chat-bubble ai"><span className="chat-avatar">🧭</span><TypingDots /></div>}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleChat} className="chat-input-row">
              <input className="form-input" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." disabled={loading} />
              <button className="btn btn-primary" type="submit" disabled={loading || !chatInput.trim()}>Send</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
