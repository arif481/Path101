/**
 * Scheduler tick script — run by GitHub Actions cron
 *
 * Scans Firestore for upcoming uncompleted sessions and creates
 * nudge notification documents. Uses distributed lock pattern to
 * prevent duplicate nudges.
 *
 * Usage: npx tsx scheduler-tick.ts
 *
 * Environment:
 *   FIREBASE_PROJECT_ID — Firebase project ID
 *   FIREBASE_SERVICE_ACCOUNT — JSON string of the service account key
 */

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

// ── Init ────────────────────────────────────────────────────

const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!projectId || !serviceAccountJson) {
  console.error("Missing FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT env vars");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
initializeApp({ credential: cert(serviceAccount), projectId });
const db = getFirestore();

// ── Config ──────────────────────────────────────────────────

const NUDGE_LOOKAHEAD_MINUTES = 30;
const NUDGE_LOOKBACK_HOURS = 24;
const LOCK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Lock (Firestore doc-based, replaces Redis SET NX) ───────

async function acquireLock(lockKey: string): Promise<boolean> {
  const ref = db.collection("schedulerLocks").doc(lockKey);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data();
        const createdAt = data?.createdAt?.toDate?.() as Date | undefined;
        if (createdAt && Date.now() - createdAt.getTime() < LOCK_TTL_MS) {
          throw new Error("locked");
        }
      }
      tx.set(ref, { createdAt: FieldValue.serverTimestamp() });
    });
    return true;
  } catch {
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────

async function run(): Promise<void> {
  const now = new Date();
  const lookahead = new Date(now.getTime() + NUDGE_LOOKAHEAD_MINUTES * 60 * 1000);
  const lookback = new Date(now.getTime() - NUDGE_LOOKBACK_HOURS * 60 * 60 * 1000);

  // Query uncompleted sessions within the time window
  const snapshot = await db
    .collection("sessions")
    .where("completedBool", "==", false)
    .where("scheduledAt", "<=", Timestamp.fromDate(lookahead))
    .where("scheduledAt", ">=", Timestamp.fromDate(lookback))
    .get();

  let scanned = 0;
  let locked = 0;
  let enqueued = 0;

  for (const docSnap of snapshot.docs) {
    scanned++;
    const data = docSnap.data();
    const sessionId = docSnap.id;
    const userId = data.userId as string;
    const scheduledAt = data.scheduledAt as Timestamp;

    const lockKey = `${sessionId}_${now.toISOString().slice(0, 10)}`;
    const acquired = await acquireLock(lockKey);
    if (!acquired) continue;
    locked++;

    // Create in-app notification
    await db.collection("notificationLogs").add({
      userId,
      channel: "in_app",
      status: "delivered",
      source: "scheduler_nudge",
      message: `Session reminder: ${sessionId}`,
      metadataJson: {
        session_id: sessionId,
        scheduled_at: scheduledAt.toDate().toISOString(),
      },
      errorDetail: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    enqueued++;
  }

  // Record metric
  await db.collection("workerMetrics").add({
    metricType: "scheduler_tick",
    value: enqueued,
    detail: `scanned=${scanned};locks=${locked};enqueued=${enqueued}`,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`Scheduler tick: scanned=${scanned} locks=${locked} enqueued=${enqueued}`);
}

run().catch((err) => {
  console.error("Scheduler tick failed:", err);
  process.exit(1);
});
