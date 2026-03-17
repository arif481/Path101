/**
 * Client-side admin service — replaces backend/app/routers/admin.py (1,147 lines)
 *
 * All operations are direct Firestore queries, protected by Security Rules
 * that check `request.auth.token.admin == true`.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  serverTimestamp,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../config";

// ── Safety Flags ────────────────────────────────────────────

export type SafetyFlagItem = {
  id: string;
  userId: string;
  triggerType: string;
  severityScore: number;
  escalationStatus: string;
  reviewStatus: string;
  triageNotes: string | null;
  reviewedAt: string | null;
  reviewerUserId: string | null;
  createdAt: string;
};

export async function listSafetyFlags(
  reviewStatus?: string
): Promise<SafetyFlagItem[]> {
  const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
  if (reviewStatus && reviewStatus !== "all") {
    constraints.unshift(where("reviewStatus", "==", reviewStatus));
  }

  const q = query(collection(db, "safetyFlags"), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId,
      triggerType: data.triggerType,
      severityScore: data.severityScore,
      escalationStatus: data.escalationStatus,
      reviewStatus: data.reviewStatus,
      triageNotes: data.triageNotes ?? null,
      reviewedAt: data.reviewedAt?.toDate?.()?.toISOString?.() ?? null,
      reviewerUserId: data.reviewerUserId ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? "",
    };
  });
}

export async function resolveFlag(
  flagId: string,
  reviewStatus: "resolved" | "dismissed",
  adminUserId: string
): Promise<void> {
  const ref = doc(db, "safetyFlags", flagId);
  await updateDoc(ref, {
    reviewStatus,
    reviewedAt: serverTimestamp(),
    reviewerUserId: adminUserId,
    ...(reviewStatus === "resolved" || reviewStatus === "dismissed"
      ? {} : {}),
  });

  // If resolving an urgent flag, downgrade escalation to "watch"
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().escalationStatus === "urgent") {
    await updateDoc(ref, { escalationStatus: "watch" });
  }
}

export async function triageFlag(
  flagId: string,
  payload: {
    reviewStatus: "pending" | "in_review" | "resolved" | "dismissed";
    escalationStatus: "none" | "watch" | "escalated" | "urgent";
    triageNotes: string;
  },
  adminUserId: string
): Promise<void> {
  const ref = doc(db, "safetyFlags", flagId);
  await updateDoc(ref, {
    reviewStatus: payload.reviewStatus,
    escalationStatus: payload.escalationStatus,
    triageNotes: payload.triageNotes || null,
    reviewedAt: serverTimestamp(),
    reviewerUserId: adminUserId,
  });

  // Create escalation event if needed
  if (payload.escalationStatus === "escalated" || payload.escalationStatus === "urgent") {
    const snap = await getDoc(ref);
    const flagData = snap.data();
    await addDoc(collection(db, "safetyEscalationEvents"), {
      safetyFlagId: flagId,
      userId: flagData?.userId ?? "",
      escalationStatus: payload.escalationStatus,
      channel: "in_app",
      status: "created",
      detail: payload.triageNotes || "Admin escalation",
      createdAt: serverTimestamp(),
    });
  }
}

export async function getSafetyFlagAnalytics(): Promise<{
  totalFlags: number;
  avgSeverity: number;
  byReviewStatus: Record<string, number>;
  byEscalationStatus: Record<string, number>;
}> {
  const snapshot = await getDocs(collection(db, "safetyFlags"));
  let totalSeverity = 0;
  const byReview: Record<string, number> = {};
  const byEscalation: Record<string, number> = {};

  snapshot.forEach((d) => {
    const data = d.data();
    totalSeverity += (data.severityScore as number) ?? 0;
    const rev = (data.reviewStatus as string) ?? "unknown";
    const esc = (data.escalationStatus as string) ?? "unknown";
    byReview[rev] = (byReview[rev] ?? 0) + 1;
    byEscalation[esc] = (byEscalation[esc] ?? 0) + 1;
  });

  const total = snapshot.size;
  return {
    totalFlags: total,
    avgSeverity: total > 0 ? Math.round((totalSeverity / total) * 10000) / 10000 : 0,
    byReviewStatus: byReview,
    byEscalationStatus: byEscalation,
  };
}

// ── Notifications ───────────────────────────────────────────

export type NotificationLogItem = {
  id: string;
  userId: string;
  channel: string;
  status: string;
  source: string;
  message: string;
  errorDetail: string | null;
  createdAt: string;
};

export async function listNotificationLogs(options?: {
  maxResults?: number;
  userId?: string;
  channel?: string;
  status?: string;
}): Promise<NotificationLogItem[]> {
  const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
  if (options?.userId) constraints.unshift(where("userId", "==", options.userId));
  if (options?.channel) constraints.unshift(where("channel", "==", options.channel));
  if (options?.status) constraints.unshift(where("status", "==", options.status));
  constraints.push(firestoreLimit(options?.maxResults ?? 50));

  const q = query(collection(db, "notificationLogs"), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId,
      channel: data.channel,
      status: data.status,
      source: data.source,
      message: data.message,
      errorDetail: data.errorDetail ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? "",
    };
  });
}

// ── Dead-letter jobs ────────────────────────────────────────

export type DeadLetterJobItem = {
  id: string;
  jobType: string;
  userId: string;
  attempt: number;
  deadLetterReason: string | null;
  deadLetteredAt: string | null;
  createdAt: string | null;
};

export async function listDeadLetterJobs(options?: {
  maxResults?: number;
  jobType?: string;
  userId?: string;
}): Promise<DeadLetterJobItem[]> {
  const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
  if (options?.jobType) constraints.unshift(where("jobType", "==", options.jobType));
  if (options?.userId) constraints.unshift(where("userId", "==", options.userId));
  constraints.push(firestoreLimit(options?.maxResults ?? 50));

  const q = query(collection(db, "deadLetterJobs"), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      jobType: data.jobType ?? "",
      userId: data.userId ?? "",
      attempt: data.attempt ?? 0,
      deadLetterReason: data.deadLetterReason ?? null,
      deadLetteredAt: data.deadLetteredAt?.toDate?.()?.toISOString?.() ?? null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    };
  });
}

export async function replayDeadLetterJob(
  deadLetterId: string,
  adminUserId: string
): Promise<boolean> {
  const ref = doc(db, "deadLetterJobs", deadLetterId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const data = snap.data();

  // Re-enqueue to taskQueue
  await addDoc(collection(db, "taskQueue"), {
    jobType: data.jobType,
    userId: data.userId,
    payload: data.payload ?? {},
    attempt: 0,
    createdAt: serverTimestamp(),
  });

  // Record replay audit
  await addDoc(collection(db, "deadLetterReplayAudits"), {
    deadLetterId,
    jobType: data.jobType ?? "unknown",
    jobUserId: data.userId ?? "unknown",
    adminUserId,
    replayStatus: "replayed",
    replayedAt: serverTimestamp(),
  });

  // Remove from dead letter
  await deleteDoc(ref);
  return true;
}

export async function dropDeadLetterJob(
  deadLetterId: string,
  adminUserId: string
): Promise<boolean> {
  const ref = doc(db, "deadLetterJobs", deadLetterId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const data = snap.data();

  // Record audit
  await addDoc(collection(db, "deadLetterReplayAudits"), {
    deadLetterId,
    jobType: data.jobType ?? "unknown",
    jobUserId: data.userId ?? "unknown",
    adminUserId,
    replayStatus: "dropped",
    replayedAt: serverTimestamp(),
  });

  await deleteDoc(ref);
  return true;
}

// ── Worker events ───────────────────────────────────────────

export type WorkerEventItem = {
  id: string;
  userId: string;
  actionId: string;
  reward: number;
  source: string;
  timestamp: string;
};

export async function listWorkerEvents(maxResults = 25): Promise<WorkerEventItem[]> {
  const q = query(
    collection(db, "banditLogs"),
    orderBy("timestamp", "desc"),
    firestoreLimit(maxResults)
  );
  const snapshot = await getDocs(q);

  const events: WorkerEventItem[] = [];
  snapshot.forEach((d) => {
    const data = d.data();
    const contextSource =
      typeof data.contextJson === "object" && data.contextJson !== null
        ? (data.contextJson as Record<string, unknown>).source
        : undefined;
    const source = (contextSource as string) ?? "unknown";
    if (source === "worker_queue" || source === "scheduler_nudge") {
      events.push({
        id: d.id,
        userId: data.userId,
        actionId: data.actionId,
        reward: data.reward,
        source,
        timestamp: data.timestamp?.toDate?.()?.toISOString?.() ?? "",
      });
    }
  });

  return events;
}

// ── RBAC management ─────────────────────────────────────────

export type AuthProfileData = {
  role: string;
  permissions: string[];
  isAdmin: boolean;
};

export async function getRbac(userId: string): Promise<AuthProfileData | null> {
  const snap = await getDoc(doc(db, "authProfiles", userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    role: (data.role as string) ?? "user",
    permissions: (data.permissions as string[]) ?? [],
    isAdmin: (data.isAdmin as boolean) ?? false,
  };
}

export async function setRbac(
  userId: string,
  role: string,
  permissions: string[]
): Promise<void> {
  await setDoc(
    doc(db, "authProfiles", userId),
    { role, permissions, isAdmin: true },
    { merge: true }
  );
}

// ── CSV export (client-side) ────────────────────────────────

export function generateCsv(
  headers: string[],
  rows: Record<string, unknown>[]
): string {
  const escape = (val: unknown) => {
    const str = String(val ?? "");
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    const line = headers.map((h) => escape(row[h])).join(",");
    lines.push(line);
  }
  return lines.join("\n");
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
