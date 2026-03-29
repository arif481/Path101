/**
 * Firestore operations for Path101's dynamic student workspace model.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../config";
import type {
  AIStudentAnalysis,
  AIWorkspace,
  ProgressCheckIn,
  StoredWorkspace,
  StudentProfileInput,
} from "../../types/workspace";

async function ensureUser(userId: string): Promise<void> {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, {
    createdAt: serverTimestamp(),
    anonymous: true,
    consentFlags: {},
  });
}

export async function saveWorkspace(
  userId: string,
  profile: StudentProfileInput,
  analysis: AIStudentAnalysis,
  workspace: AIWorkspace
): Promise<string> {
  await ensureUser(userId);

  const workspaceRef = await addDoc(collection(db, "workspaces"), {
    userId,
    profile,
    analysis,
    workspaceJson: workspace,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return workspaceRef.id;
}

export async function getLatestWorkspace(userId: string): Promise<StoredWorkspace | null> {
  const workspaceQuery = query(
    collection(db, "workspaces"),
    where("userId", "==", userId),
    orderBy("updatedAt", "desc"),
    limit(1)
  );
  const snapshot = await getDocs(workspaceQuery);

  if (snapshot.empty) return null;

  const latest = snapshot.docs[0];
  const data = latest.data();

  return {
    workspaceId: latest.id,
    userId: data.userId as string,
    profile: data.profile as StudentProfileInput,
    analysis: data.analysis as AIStudentAnalysis,
    workspace: data.workspaceJson as AIWorkspace,
  };
}

export async function updateWorkspace(
  workspaceId: string,
  workspace: AIWorkspace
): Promise<void> {
  await updateDoc(doc(db, "workspaces", workspaceId), {
    workspaceJson: workspace,
    updatedAt: serverTimestamp(),
  });
}

export async function saveCheckIn(
  userId: string,
  workspaceId: string,
  checkIn: ProgressCheckIn
): Promise<void> {
  await addDoc(collection(db, "checkIns"), {
    userId,
    workspaceId,
    ...checkIn,
    createdAt: serverTimestamp(),
  });
}

export async function recordProgressEvent(
  userId: string,
  workspaceId: string,
  eventType: "action_completed" | "action_reopened" | "checkin_logged",
  payload: Record<string, unknown>
): Promise<void> {
  await addDoc(collection(db, "progressEvents"), {
    userId,
    workspaceId,
    eventType,
    payload,
    createdAt: serverTimestamp(),
  });
}

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
    rawText,
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
