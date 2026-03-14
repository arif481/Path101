import { useEffect, useState } from "react";
import {
  authAnonymous,
  authLogin,
  authMe,
  authRegister,
  completeSession,
  getAdminQueueHealth,
  listSafetyFlags,
  listWorkerEvents,
  resolveSafetyFlag,
  submitIntake,
  triggerSchedulerTick,
} from "./api";
import type {
  AnonymousAuthResponse,
  AuthTokenResponse,
  IntakeResponse,
  QueueHealthResponse,
  SchedulerTickResponse,
  SafetyFlagItem,
  SessionCompleteResponse,
  WorkerEventItem,
} from "./types";

const TOKEN_KEY = "path101.token";
const USER_KEY = "path101.user";
const ANON_KEY = "path101.anonymous";

export function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [availableTimes, setAvailableTimes] = useState("7-9pm weekdays");
  const [intakeResult, setIntakeResult] = useState<IntakeResponse | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionCompleteResponse | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [flags, setFlags] = useState<SafetyFlagItem[]>([]);
  const [queueHealth, setQueueHealth] = useState<QueueHealthResponse | null>(null);
  const [workerEvents, setWorkerEvents] = useState<WorkerEventItem[]>([]);
  const [schedulerTick, setSchedulerTick] = useState<SchedulerTickResponse | null>(null);
  const [flagFilter, setFlagFilter] = useState("pending");
  const [adminLoading, setAdminLoading] = useState(false);
  const [preMood, setPreMood] = useState(5);
  const [postMood, setPostMood] = useState(6);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    const storedAnon = localStorage.getItem(ANON_KEY);

    if (!storedToken || !storedUser) {
      return;
    }

    setAuthToken(storedToken);
    setUserId(storedUser);
    setAnonymous(storedAnon === "true");

    void authMe(storedToken).catch(() => {
      clearSession();
    });
  }, []);

  function persistSession(result: AuthTokenResponse | AnonymousAuthResponse) {
    setAuthToken(result.access_token);
    setUserId(result.user_id);
    setAnonymous(result.anonymous);
    localStorage.setItem(TOKEN_KEY, result.access_token);
    localStorage.setItem(USER_KEY, result.user_id);
    localStorage.setItem(ANON_KEY, String(result.anonymous));
  }

  function clearSession() {
    setAuthToken(null);
    setUserId(null);
    setAnonymous(false);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ANON_KEY);
  }

  async function onAnonymousSignIn() {
    setLoading(true);
    setError(null);
    try {
      const result = await authAnonymous();
      persistSession(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await authRegister(email, password);
      persistSession(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await authLogin(email, password);
      persistSession(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitIntake(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) {
      setError("Sign in first to create a plan.");
      return;
    }

    setLoading(true);
    setError(null);
    setSessionResult(null);

    try {
      const payload = {
        user_id: userId,
        text,
        available_times: availableTimes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        preferences: { modality: "text" },
      };

      const result = await submitIntake(payload);
      setIntakeResult(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onCompleteSession(event: React.FormEvent) {
    event.preventDefault();
    if (!intakeResult) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await completeSession(
        intakeResult.plan_preview.next_session.session_id,
        preMood,
        postMood,
        feedback
      );
      setSessionResult(response);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function onLoadQueueHealth() {
    if (!adminKey.trim()) {
      setError("Admin key is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const health = await getAdminQueueHealth(adminKey.trim());
      setQueueHealth(health);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onLoadFlags() {
    if (!adminKey.trim()) {
      setError("Admin key is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const result = await listSafetyFlags(adminKey.trim(), flagFilter);
      setFlags(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onResolveFlag(flagId: number, reviewStatus: "resolved" | "dismissed") {
    if (!adminKey.trim()) {
      setError("Admin key is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      await resolveSafetyFlag(adminKey.trim(), flagId, reviewStatus);
      await onLoadFlags();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setAdminLoading(false);
    }
  }

  async function onLoadWorkerEvents() {
    if (!adminKey.trim()) {
      setError("Admin key is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const events = await listWorkerEvents(adminKey.trim(), 25);
      setWorkerEvents(events);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onTriggerSchedulerTick() {
    if (!adminKey.trim()) {
      setError("Admin key is required.");
      return;
    }

    const key = adminKey.trim();
    setAdminLoading(true);
    setError(null);
    try {
      const result = await triggerSchedulerTick(key);
      setSchedulerTick(result);

      const [events, health] = await Promise.all([
        listWorkerEvents(key, 25),
        getAdminQueueHealth(key),
      ]);
      setWorkerEvents(events);
      setQueueHealth(health);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  return (
    <main className="layout">
      <section className="card">
        <h2>Account</h2>
        {userId ? (
          <div className="stack">
            <p>
              Signed in as <strong>{userId}</strong> ({anonymous ? "anonymous" : "registered"})
            </p>
            <button type="button" onClick={clearSession} disabled={loading}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="stack">
            <button type="button" onClick={onAnonymousSignIn} disabled={loading}>
              Continue anonymously
            </button>

            <form onSubmit={onRegister} className="stack">
              <h3>Register</h3>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={loading}>
                Register
              </button>
            </form>

            <form onSubmit={onLogin} className="stack">
              <h3>Login</h3>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={loading}>
                Login
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="card">
        <h1>Path101 MVP</h1>
        <p className="subtle">
          Tell me the single problem you want to change and one measurable goal.
        </p>
        <form onSubmit={onSubmitIntake} className="stack">
          <p>
            <strong>User:</strong> {userId ?? "Not signed in"}
          </p>
          <label>
            Intake Text
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder="I keep delaying assignments. Goal: do two focused sessions per day."
              required
            />
          </label>
          <label>
            Available Times (comma-separated)
            <input
              value={availableTimes}
              onChange={(event) => setAvailableTimes(event.target.value)}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Working..." : "Generate Plan Preview"}
          </button>
        </form>
      </section>

      {intakeResult && (
        <section className="card">
          <h2>Plan Preview</h2>
          <p>
            <strong>SMART goal:</strong> {intakeResult.smart_goal}
          </p>
          {intakeResult.safety_triggered && (
            <p className="danger">{intakeResult.triage_message}</p>
          )}
          <p>
            <strong>Modules:</strong> {intakeResult.plan_preview.modules.join(", ")}
          </p>
          <p>
            <strong>Next session:</strong> {intakeResult.plan_preview.next_session.title} (
            {intakeResult.plan_preview.next_session.duration_mins} min)
          </p>
          <ul>
            {intakeResult.plan_preview.next_session.steps.map((step) => (
              <li key={step.title}>
                {step.title} — {step.duration_mins}m
              </li>
            ))}
          </ul>

          <form onSubmit={onCompleteSession} className="stack top-gap">
            <h3>Complete Session</h3>
            <label>
              Pre-mood (1-10)
              <input
                type="number"
                min={1}
                max={10}
                value={preMood}
                onChange={(event) => setPreMood(Number(event.target.value))}
                required
              />
            </label>
            <label>
              Post-mood (1-10)
              <input
                type="number"
                min={1}
                max={10}
                value={postMood}
                onChange={(event) => setPostMood(Number(event.target.value))}
                required
              />
            </label>
            <label>
              Feedback
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={3}
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Submit Completion"}
            </button>
          </form>

          {sessionResult && (
            <div className="result top-gap">
              <h3>Next Recommendation</h3>
              <p>
                {sessionResult.next_recommendation.title} ({sessionResult.next_recommendation.duration_mins}
                m)
              </p>
              <p>
                <strong>Reward:</strong> {sessionResult.reward}
              </p>
              <p>
                <strong>Why:</strong> {sessionResult.rationale}
              </p>
            </div>
          )}
        </section>
      )}

      {error && <section className="card danger">{error}</section>}

      <section className="card">
        <h2>Admin Safety</h2>
        <div className="stack">
          <label>
            Admin Key
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="Enter X-Admin-Key value"
            />
          </label>

          <div className="stack">
            <button type="button" onClick={onLoadQueueHealth} disabled={adminLoading}>
              {adminLoading ? "Loading..." : "Check Queue Health"}
            </button>
            {queueHealth && (
              <p>
                Queue: {queueHealth.connected ? "connected" : "disconnected"} • Pending jobs: {queueHealth.queue_size}
              </p>
            )}
          </div>

          <label>
            Flag Filter
            <select value={flagFilter} onChange={(event) => setFlagFilter(event.target.value)}>
              <option value="all">all</option>
              <option value="pending">pending</option>
              <option value="resolved">resolved</option>
              <option value="dismissed">dismissed</option>
            </select>
          </label>

          <button type="button" onClick={onLoadFlags} disabled={adminLoading}>
            {adminLoading ? "Loading..." : "Load Safety Flags"}
          </button>

          {flags.length === 0 ? (
            <p className="subtle">No flags for this filter.</p>
          ) : (
            <ul>
              {flags.map((flag) => (
                <li key={flag.id} className="top-gap">
                  <strong>#{flag.id}</strong> {flag.trigger_type} • {flag.review_status} • {flag.user_id}
                  <div className="stack top-gap">
                    <button
                      type="button"
                      onClick={() => onResolveFlag(flag.id, "resolved")}
                      disabled={adminLoading || flag.review_status === "resolved"}
                    >
                      Mark Resolved
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolveFlag(flag.id, "dismissed")}
                      disabled={adminLoading || flag.review_status === "dismissed"}
                    >
                      Mark Dismissed
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button type="button" onClick={onLoadWorkerEvents} disabled={adminLoading}>
            {adminLoading ? "Loading..." : "Load Worker Activity"}
          </button>

          <button type="button" onClick={onTriggerSchedulerTick} disabled={adminLoading}>
            {adminLoading ? "Loading..." : "Run Scheduler Tick Now"}
          </button>

          {schedulerTick && (
            <p>
              Tick result — scanned: {schedulerTick.scanned_sessions}, locks: {schedulerTick.acquired_locks}, enqueued: {schedulerTick.enqueued_jobs}
            </p>
          )}

          {workerEvents.length === 0 ? (
            <p className="subtle">No worker events loaded.</p>
          ) : (
            <ul>
              {workerEvents.map((event) => (
                <li key={event.id}>
                  #{event.id} • {event.source} • {event.action_id} • {event.user_id} • reward: {event.reward}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Need urgent help?</h2>
        <p>
          This app is not a crisis response tool. If you may be in immediate danger, contact local
          emergency services now.
        </p>
      </section>
    </main>
  );
}
