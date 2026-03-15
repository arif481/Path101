import { useEffect, useState } from "react";
import {
  downloadActionAnalyticsCsv,
  downloadUserAnalyticsCsv,
  getActionAnalytics,
  getUserAnalytics,
  authAnonymous,
  authLogin,
  authMe,
  authRegister,
  completeSession,
  getAdminQueueHealth,
  listSafetyFlags,
  listDeadLetterJobs,
  listWorkerEvents,
  replayDeadLetterJob,
  resolveSafetyFlag,
  submitIntake,
  triggerSchedulerTick,
} from "./api";
import type {
  BanditAnalyticsResponse,
  DeadLetterJobItem,
  AnonymousAuthResponse,
  AuthTokenResponse,
  IntakeResponse,
  QueueHealthResponse,
  SchedulerTickResponse,
  SafetyFlagItem,
  SessionCompleteResponse,
  UserAnalyticsResponse,
  WorkerEventItem,
} from "./types";

const TOKEN_KEY = "path101.token";
const USER_KEY = "path101.user";
const ANON_KEY = "path101.anonymous";
const ADMIN_POLL_KEY = "path101.admin.poll_mode";
const ADMIN_FLAG_FILTER_KEY = "path101.admin.flag_filter";

export function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [availableTimes, setAvailableTimes] = useState("7-9pm weekdays");
  const [intakeResult, setIntakeResult] = useState<IntakeResponse | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionCompleteResponse | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [flags, setFlags] = useState<SafetyFlagItem[]>([]);
  const [queueHealth, setQueueHealth] = useState<QueueHealthResponse | null>(null);
  const [deadLetterJobs, setDeadLetterJobs] = useState<DeadLetterJobItem[]>([]);
  const [workerEvents, setWorkerEvents] = useState<WorkerEventItem[]>([]);
  const [schedulerTick, setSchedulerTick] = useState<SchedulerTickResponse | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [analyticsResult, setAnalyticsResult] = useState<BanditAnalyticsResponse | null>(null);
  const [userAnalyticsResult, setUserAnalyticsResult] = useState<UserAnalyticsResponse | null>(null);
  const [pollMode, setPollMode] = useState(false);
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
    const storedPollMode = localStorage.getItem(ADMIN_POLL_KEY);
    const storedFlagFilter = localStorage.getItem(ADMIN_FLAG_FILTER_KEY);

    if (!storedToken || !storedUser) {
      return;
    }

    setAuthToken(storedToken);
    setAdminToken(storedToken);
    setUserId(storedUser);
    setAnonymous(storedAnon === "true");

    if (storedPollMode === "true") {
      setPollMode(true);
    }

    if (storedFlagFilter && ["all", "pending", "resolved", "dismissed"].includes(storedFlagFilter)) {
      setFlagFilter(storedFlagFilter);
    }

    void authMe(storedToken)
      .then((me) => {
        setIsAdmin(me.is_admin);
      })
      .catch(() => {
        clearSession();
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(ADMIN_POLL_KEY, String(pollMode));
  }, [pollMode]);

  useEffect(() => {
    localStorage.setItem(ADMIN_FLAG_FILTER_KEY, flagFilter);
  }, [flagFilter]);

  useEffect(() => {
    if (!pollMode) {
      return;
    }

    const key = adminToken.trim();
    if (!key) {
      return;
    }

    const timer = window.setInterval(() => {
      void Promise.all([listWorkerEvents(key, 25), getAdminQueueHealth(key), listDeadLetterJobs(key, 25)])
        .then(([events, health, deadLetters]) => {
          setWorkerEvents(events);
          setQueueHealth(health);
          setDeadLetterJobs(deadLetters);
        })
        .catch(() => {
          setPollMode(false);
        });
    }, 12000);

    return () => {
      window.clearInterval(timer);
    };
  }, [pollMode, adminToken]);

  function persistSession(result: AuthTokenResponse | AnonymousAuthResponse) {
    setAuthToken(result.access_token);
    setAdminToken(result.access_token);
    setUserId(result.user_id);
    setAnonymous(result.anonymous);
    setIsAdmin(result.is_admin);
    localStorage.setItem(TOKEN_KEY, result.access_token);
    localStorage.setItem(USER_KEY, result.user_id);
    localStorage.setItem(ANON_KEY, String(result.anonymous));
  }

  function clearSession() {
    setAuthToken(null);
    setAdminToken("");
    setUserId(null);
    setAnonymous(false);
    setIsAdmin(false);
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
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const health = await getAdminQueueHealth(adminToken.trim());
      setQueueHealth(health);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onLoadFlags() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const result = await listSafetyFlags(adminToken.trim(), flagFilter);
      setFlags(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onResolveFlag(flagId: number, reviewStatus: "resolved" | "dismissed") {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      await resolveSafetyFlag(adminToken.trim(), flagId, reviewStatus);
      await onLoadFlags();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
      setAdminLoading(false);
    }
  }

  async function onLoadWorkerEvents() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const events = await listWorkerEvents(adminToken.trim(), 25);
      setWorkerEvents(events);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onLoadDeadLetterJobs() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const jobs = await listDeadLetterJobs(adminToken.trim(), 25);
      setDeadLetterJobs(jobs);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onReplayDeadLetter(deadLetterId: string) {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    const key = adminToken.trim()
    setAdminLoading(true);
    setError(null);
    try {
      await replayDeadLetterJob(key, deadLetterId);
      const [jobs, health] = await Promise.all([
        listDeadLetterJobs(key, 25),
        getAdminQueueHealth(key),
      ]);
      setDeadLetterJobs(jobs);
      setQueueHealth(health);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onTriggerSchedulerTick() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    const key = adminToken.trim();
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

  async function onLoadActionAnalytics() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const result = await getActionAnalytics(adminToken.trim(), analyticsDays, 20);
      setAnalyticsResult(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onLoadUserAnalytics() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      const result = await getUserAnalytics(adminToken.trim(), analyticsDays, 20);
      setUserAnalyticsResult(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onDownloadActionAnalyticsCsv() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      await downloadActionAnalyticsCsv(adminToken.trim(), analyticsDays, 20);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setAdminLoading(false);
    }
  }

  async function onDownloadUserAnalyticsCsv() {
    if (!adminToken.trim()) {
      setError("Admin token is required.");
      return;
    }

    setAdminLoading(true);
    setError(null);
    try {
      await downloadUserAnalyticsCsv(adminToken.trim(), analyticsDays, 20);
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
        {!isAdmin && <p className="subtle">Login with an admin allowlisted account to access admin endpoints.</p>}
        <div className="stack">
          <label>
            Admin Token
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Enter admin bearer token"
            />
          </label>

          <div className="stack">
            <label>
              <input
                type="checkbox"
                checked={pollMode}
                onChange={(event) => setPollMode(event.target.checked)}
              />
              Live poll mode (12s)
            </label>

            <button type="button" onClick={onLoadQueueHealth} disabled={adminLoading}>
              {adminLoading ? "Loading..." : "Check Queue Health"}
            </button>
            {queueHealth && (
              <p>
                Queue: {queueHealth.connected ? "connected" : "disconnected"} • Pending jobs: {queueHealth.queue_size} • Dead-letter jobs: {queueHealth.dead_letter_size}
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

          <button type="button" onClick={onLoadDeadLetterJobs} disabled={adminLoading}>
            {adminLoading ? "Loading..." : "Load Dead-Letter Jobs"}
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

          {deadLetterJobs.length === 0 ? (
            <p className="subtle">No dead-letter jobs loaded.</p>
          ) : (
            <ul>
              {deadLetterJobs.map((job) => (
                <li key={job.dead_letter_id} className="top-gap">
                  {job.dead_letter_id} • {job.job_type} • {job.user_id} • attempt: {job.attempt}
                  {job.dead_letter_reason ? ` • reason: ${job.dead_letter_reason}` : ""}
                  <div className="stack top-gap">
                    <button
                      type="button"
                      onClick={() => onReplayDeadLetter(job.dead_letter_id)}
                      disabled={adminLoading}
                    >
                      Replay Dead-Letter Job
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="stack top-gap">
            <label>
              Analytics window (days)
              <input
                type="number"
                min={1}
                max={365}
                value={analyticsDays}
                onChange={(event) => setAnalyticsDays(Number(event.target.value || 30))}
              />
            </label>
            <button type="button" onClick={onLoadActionAnalytics} disabled={adminLoading}>
              {adminLoading ? "Loading..." : "Load Action Analytics"}
            </button>
            <button type="button" onClick={onLoadUserAnalytics} disabled={adminLoading}>
              {adminLoading ? "Loading..." : "Load User Analytics"}
            </button>
            <button type="button" onClick={onDownloadActionAnalyticsCsv} disabled={adminLoading}>
              {adminLoading ? "Loading..." : "Download Action CSV"}
            </button>
            <button type="button" onClick={onDownloadUserAnalyticsCsv} disabled={adminLoading}>
              {adminLoading ? "Loading..." : "Download User CSV"}
            </button>
          </div>

          {analyticsResult && (
            <div className="top-gap">
              <p>
                Analytics: {analyticsResult.total_events} events in last {analyticsResult.days} day(s)
              </p>
              {analyticsResult.actions.length === 0 ? (
                <p className="subtle">No action analytics available.</p>
              ) : (
                <ul>
                  {analyticsResult.actions.map((item) => (
                    <li key={item.action_id}>
                      {item.action_id} • count: {item.count} • avg reward: {item.avg_reward.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {userAnalyticsResult && (
            <div className="top-gap">
              <p>
                User analytics: {userAnalyticsResult.total_users} user(s) in last {userAnalyticsResult.days} day(s)
              </p>
              {userAnalyticsResult.users.length === 0 ? (
                <p className="subtle">No user analytics available.</p>
              ) : (
                <ul>
                  {userAnalyticsResult.users.map((user) => (
                    <li key={user.user_id}>
                      {user.user_id} • completion: {(user.completion_rate * 100).toFixed(1)}% ({user.sessions_completed}/{user.sessions_total}) • avg reward: {user.avg_reward.toFixed(2)} • trend: {user.reward_trend}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
