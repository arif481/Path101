import { useState } from "react";
import { completeSession, submitIntake } from "./api";
import type { IntakeResponse, SessionCompleteResponse } from "./types";

export function App() {
  const [userId, setUserId] = useState("demo-user");
  const [text, setText] = useState("");
  const [availableTimes, setAvailableTimes] = useState("7-9pm weekdays");
  const [intakeResult, setIntakeResult] = useState<IntakeResponse | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionCompleteResponse | null>(null);
  const [preMood, setPreMood] = useState(5);
  const [postMood, setPostMood] = useState(6);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmitIntake(event: React.FormEvent) {
    event.preventDefault();
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

  return (
    <main className="layout">
      <section className="card">
        <h1>Path101 MVP</h1>
        <p className="subtle">
          Tell me the single problem you want to change and one measurable goal.
        </p>
        <form onSubmit={onSubmitIntake} className="stack">
          <label>
            User ID
            <input value={userId} onChange={(event) => setUserId(event.target.value)} required />
          </label>
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
        <h2>Need urgent help?</h2>
        <p>
          This app is not a crisis response tool. If you may be in immediate danger, contact local
          emergency services now.
        </p>
      </section>
    </main>
  );
}
