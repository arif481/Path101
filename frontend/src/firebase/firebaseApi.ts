/**
 * Firebase API layer — replaces REST calls when VITE_USE_FIREBASE=true
 *
 * This module mirrors the function signatures from ../api.ts but
 * calls client-side Firebase services instead of the REST backend.
 */

import { auth } from "./config";
import {
  loginAnonymously,
  register,
  login,
  logout,
  requestPasswordReset,
  fetchAuthProfile,
} from "./authService";
import { compilePlan, computeReward } from "./services/intakeService";
import { evaluateSafetyText } from "./services/safetyService";
import { selectNextRecommendation } from "./services/banditService";
import {
  savePlan,
  getLatestPlan,
  completeSession as completeSessionOp,
  addSafetyFlag,
  createSafetyEscalationEvent,
  addBanditLog,
  enqueueTask,
} from "./services/firestoreOps";

import type {
  IntakeRequest,
  IntakeResponse,
  AnonymousAuthResponse,
  AuthTokenResponse,
  MeResponse,
  SessionCompleteResponse,
} from "../types";

// ── Auth ────────────────────────────────────────────────────

export async function firebaseAuthAnonymous(): Promise<AnonymousAuthResponse> {
  const user = await loginAnonymously();
  const token = await user.getIdToken();
  const profile = await fetchAuthProfile(user.uid);

  return {
    access_token: token,
    refresh_token: null,
    token_type: "bearer",
    user_id: user.uid,
    anonymous: true,
    is_admin: profile.isAdmin,
    role: profile.role,
    permissions: profile.permissions,
    anon_id: user.uid,
  };
}

export async function firebaseAuthRegister(
  email: string,
  password: string
): Promise<AuthTokenResponse> {
  const user = await register(email, password);
  const token = await user.getIdToken();
  const profile = await fetchAuthProfile(user.uid);

  return {
    access_token: token,
    refresh_token: null,
    token_type: "bearer",
    user_id: user.uid,
    anonymous: false,
    is_admin: profile.isAdmin,
    role: profile.role,
    permissions: profile.permissions,
  };
}

export async function firebaseAuthLogin(
  email: string,
  password: string
): Promise<AuthTokenResponse> {
  const user = await login(email, password);
  const token = await user.getIdToken();
  const profile = await fetchAuthProfile(user.uid);

  return {
    access_token: token,
    refresh_token: null,
    token_type: "bearer",
    user_id: user.uid,
    anonymous: false,
    is_admin: profile.isAdmin,
    role: profile.role,
    permissions: profile.permissions,
  };
}

export async function firebaseAuthLogout(): Promise<void> {
  await logout();
}

export async function firebaseAuthMe(): Promise<MeResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const profile = await fetchAuthProfile(user.uid);
  return {
    user_id: user.uid,
    anonymous: user.isAnonymous,
    is_admin: profile.isAdmin,
    role: profile.role,
    permissions: profile.permissions,
    created_at: user.metadata.creationTime ?? new Date().toISOString(),
  };
}

export async function firebaseRequestPasswordReset(
  email: string
): Promise<{ status: string; reset_token: string | null }> {
  await requestPasswordReset(email);
  return { status: "ok", reset_token: null };
}

// ── Intake ──────────────────────────────────────────────────

export async function firebaseSubmitIntake(
  payload: IntakeRequest
): Promise<IntakeResponse> {
  // Safety check first
  const triage = evaluateSafetyText(payload.text);

  if (triage.triggered) {
    const { plan } = compilePlan(payload.user_id, payload.text, payload.available_times);
    const flagId = await addSafetyFlag(
      payload.user_id,
      payload.text,
      triage.triggerType,
      triage.severityScore,
      triage.escalationStatus,
      triage.triageMessage
    );

    if (triage.escalationStatus === "escalated" || triage.escalationStatus === "urgent") {
      await createSafetyEscalationEvent(
        payload.user_id,
        triage.escalationStatus,
        triage.triageMessage || "Safety escalation triggered",
        flagId
      );
    }

    return {
      plan_preview: {
        plan_id: plan.planId,
        user_id: plan.userId,
        current_week: plan.currentWeek,
        duration_weeks: plan.durationWeeks,
        modules: plan.modules,
        next_session: {
          session_id: plan.nextSession.sessionId,
          title: plan.nextSession.title,
          duration_mins: plan.nextSession.durationMins,
          steps: plan.nextSession.steps.map((s) => ({
            title: s.title,
            duration_mins: s.durationMins,
          })),
          expected_metrics: plan.nextSession.expectedMetrics,
          difficulty: plan.nextSession.difficulty,
          scheduled_at: plan.nextSession.scheduledAt,
        },
        suggested_calendar_times: plan.suggestedCalendarTimes,
      },
      smart_goal: "Safety first: connect to urgent help resources now.",
      safety_triggered: true,
      triage_message: triage.triageMessage,
    };
  }

  // Normal flow
  const { plan, smartGoal } = compilePlan(
    payload.user_id,
    payload.text,
    payload.available_times
  );
  await savePlan(payload.user_id, plan);

  // Enqueue nudge task
  await enqueueTask("schedule_session_nudge", payload.user_id, {
    session_id: plan.nextSession.sessionId,
    scheduled_at: plan.nextSession.scheduledAt,
  });

  return {
    plan_preview: {
      plan_id: plan.planId,
      user_id: plan.userId,
      current_week: plan.currentWeek,
      duration_weeks: plan.durationWeeks,
      modules: plan.modules,
      next_session: {
        session_id: plan.nextSession.sessionId,
        title: plan.nextSession.title,
        duration_mins: plan.nextSession.durationMins,
        steps: plan.nextSession.steps.map((s) => ({
          title: s.title,
          duration_mins: s.durationMins,
        })),
        expected_metrics: plan.nextSession.expectedMetrics,
        difficulty: plan.nextSession.difficulty,
        scheduled_at: plan.nextSession.scheduledAt,
      },
      suggested_calendar_times: plan.suggestedCalendarTimes,
    },
    smart_goal: smartGoal,
    safety_triggered: false,
    triage_message: null,
  };
}

// ── Session complete ────────────────────────────────────────

export async function firebaseCompleteSession(
  sessionId: string,
  preMood: number,
  postMood: number,
  feedback: string
): Promise<SessionCompleteResponse> {
  const result = await completeSessionOp(sessionId, preMood, postMood, feedback);
  if (!result) throw new Error("Session not found");

  const reward = computeReward(preMood, postMood, false);
  const banditResult = await selectNextRecommendation(
    result.userId,
    sessionId,
    feedback
  );

  // Log the bandit decision
  await addBanditLog(
    result.userId,
    {
      recommendation_title: banditResult.plan.title,
      recommendation_difficulty: banditResult.plan.difficulty,
      pre_mood: preMood,
      post_mood: postMood,
      source: "worker_queue",
    },
    banditResult.actionId,
    banditResult.policyVersion,
    reward
  );

  // Enqueue completion task
  await enqueueTask("session_completed", result.userId, {
    session_id: sessionId,
    action_id: banditResult.actionId,
    policy_version: banditResult.policyVersion,
    reward,
    pre_mood: preMood,
    post_mood: postMood,
  });

  return {
    next_recommendation: {
      session_id: banditResult.plan.sessionId,
      title: banditResult.plan.title,
      duration_mins: banditResult.plan.durationMins,
      steps: banditResult.plan.steps.map((s) => ({
        title: s.title,
        duration_mins: s.durationMins,
      })),
      expected_metrics: banditResult.plan.expectedMetrics,
      difficulty: banditResult.plan.difficulty,
      scheduled_at: banditResult.plan.scheduledAt,
    },
    reward,
    rationale: banditResult.rationale,
  };
}
