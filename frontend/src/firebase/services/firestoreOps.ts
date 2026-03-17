/**
 * Firestore CRUD operations — replaces backend/app/services/persistence.py
 *
 * Read/write helpers for plans, sessions, safety flags, bandit logs,
 * notification logs, and other collections.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../config";
import type { PlanPreview, SessionPlan } from "./intakeService";

// ── User ────────────────────────────────────────────────────

export async function ensureUser(userId: string): Promise<void> {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    createdAt: serverTimestamp(),
    anonymous: true,
    consentFlags: {},
  });
}

// ── Plans ───────────────────────────────────────────────────

export async function savePlan(userId: string, plan: PlanPreview): Promise<void> {
  await ensureUser(userId);

  // Save plan document
  await setDoc(doc(db, "plans", plan.planId), {
    userId,
    planJson: plan,
    startDate: serverTimestamp(),
    endDate: null,
    currentWeek: plan.currentWeek,
    createdAt: serverTimestamp(),
  });

  // Save the initial session document
  const session = plan.nextSession;
  await setDoc(doc(db, "sessions", session.sessionId), {
    planId: plan.planId,
    userId,
    sessionType: "micro",
    scheduledAt: session.scheduledAt ?? null,
    completedBool: false,
    preMood: null,
    postMood: null,
    feedback: null,
    createdAt: serverTimestamp(),
  });
}

export type StoredPlan = {
  planId: string;
  userId: string;
  planJson: PlanPreview;
  currentWeek: number;
  startDate: Timestamp;
};

export async function getLatestPlan(userId: string): Promise<StoredPlan | null> {
  const q = query(
    collection(db, "plans"),
    where("userId", "==", userId),
    orderBy("startDate", "desc"),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  return {
    planId: docSnap.id,
    userId: data.userId,
    planJson: data.planJson as PlanPreview,
    currentWeek: data.currentWeek,
    startDate: data.startDate,
  };
}

// ── Sessions ────────────────────────────────────────────────

export async function completeSession(
  sessionId: string,
  preMood: number,
  postMood: number,
  feedback: string
): Promise<{ userId: string; planId: string } | null> {
  const ref = doc(db, "sessions", sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  await updateDoc(ref, {
    completedBool: true,
    preMood,
    postMood,
    feedback,
    completedAt: serverTimestamp(),
  });

  return {
    userId: data.userId as string,
    planId: data.planId as string,
  };
}

// ── Safety flags ────────────────────────────────────────────

export async function addSafetyFlag(
  userId: string,
  rawText: string,
  triggerType: string,
  severityScore: number,
  escalationStatus: string,
  triageNotes: string | null
): Promise<string> {
  const ref = await addDoc(collection(db, "safetyFlags"), {
    userId,
    triggerType,
    severityScore,
    escalationStatus,
    rawTextEncrypted: rawText,
    reviewStatus: "pending",
    triageNotes: triageNotes ?? null,
    reviewedAt: null,
    reviewerUserId: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function createSafetyEscalationEvent(
  userId: string,
  escalationStatus: string,
  detail: string,
  safetyFlagId: string | null
): Promise<void> {
  await addDoc(collection(db, "safetyEscalationEvents"), {
    safetyFlagId,
    userId,
    escalationStatus,
    channel: "in_app",
    status: "created",
    detail,
    createdAt: serverTimestamp(),
  });
}

// ── Bandit logs ─────────────────────────────────────────────

export async function addBanditLog(
  userId: string,
  contextJson: Record<string, unknown>,
  actionId: string,
  policyVersion: string,
  reward: number
): Promise<void> {
  await addDoc(collection(db, "banditLogs"), {
    userId,
    contextJson,
    actionId,
    policyVersion,
    reward,
    timestamp: serverTimestamp(),
  });
}

// ── Notification logs (in-app) ──────────────────────────────

export async function addNotificationLog(
  userId: string,
  channel: string,
  message: string,
  source: string,
  status: "delivered" | "failed",
  errorDetail: string | null = null
): Promise<void> {
  await addDoc(collection(db, "notificationLogs"), {
    userId,
    channel,
    status,
    source,
    message,
    metadataJson: {},
    errorDetail,
    createdAt: serverTimestamp(),
  });
}

// ── Task queue (replaces Redis queue) ───────────────────────

export async function enqueueTask(
  jobType: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await addDoc(collection(db, "taskQueue"), {
    jobType,
    userId,
    payload,
    attempt: 0,
    createdAt: serverTimestamp(),
  });
}

// ── Worker metrics ──────────────────────────────────────────

export async function recordWorkerMetric(
  metricType: string,
  value: number,
  detail: string | null = null
): Promise<void> {
  await addDoc(collection(db, "workerMetrics"), {
    metricType,
    value,
    detail,
    createdAt: serverTimestamp(),
  });
}
