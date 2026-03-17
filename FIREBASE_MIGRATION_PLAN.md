# Path101 Firebase-Native Migration Plan

## Goal
Migrate Path101 from FastAPI + PostgreSQL + Redis worker architecture to:

- Firebase Authentication
- Firestore
- Cloud Functions (HTTP + background)
- Cloud Scheduler / Pub/Sub (for worker-like jobs)
- GitHub Pages for frontend hosting

This enables a no-server-management deployment model and aligns with static frontend hosting.

## Current System Components to Replace

1. Auth (JWT + refresh + reset): move to Firebase Auth + custom claims.
2. SQL tables: move to Firestore collections.
3. Admin APIs: move to callable/HTTP Cloud Functions.
4. Redis queue + worker + dead-letter: move to Pub/Sub + Firestore dead-letter collection.
5. Notification channels: move to Functions-driven providers (in-app doc logs + webhook + optional email provider).
6. Scheduler tick: move to Cloud Scheduler triggering a Function.
7. Analytics endpoints: compute from Firestore collections (or pre-aggregate docs).

## Target Architecture

- Frontend (React) hosted on GitHub Pages.
- Frontend calls Firebase Auth directly for sign-in/token lifecycle.
- Frontend calls Cloud Functions HTTPS endpoints for business logic.
- Firestore stores domain data and audit logs.
- Cloud Scheduler triggers periodic nudge job Function.
- Pub/Sub processes asynchronous jobs; failed jobs move to dead-letter collection.

## Firestore Collection Mapping

- users/{userId}
  - createdAt, anonymous, profile, consentFlags
- authProfiles/{userId}
  - role, permissions, admin flags
- plans/{planId}
  - userId, plan payload, currentWeek, startDate/endDate
- sessions/{sessionId}
  - userId, planId, scheduledAt, completed, mood/feedback
- banditLogs/{eventId}
  - userId, context, actionId, reward, timestamp
- safetyFlags/{flagId}
  - userId, triggerType, severityScore, escalationStatus, reviewStatus, triageNotes, reviewedAt
- safetyEscalationEvents/{eventId}
  - safetyFlagId, userId, channel, status, detail, createdAt
- notificationLogs/{logId}
  - userId, channel, source, status, errorDetail, createdAt
- deadLetterJobs/{deadLetterId}
  - job payload, attempts, reason, createdAt
- deadLetterReplayAudits/{auditId}
  - deadLetterId, adminUserId, replayStatus, replayedAt
- workerMetrics/{metricId}
  - metricType, value, detail, createdAt

## Phased Migration (Execution Order)

### Phase 1: Firebase Foundation

- Create Firebase project and environments.
- Enable Firebase Auth (email/password + anonymous).
- Initialize Firestore in production mode.
- Add Firebase SDK to frontend.
- Add Firebase Admin SDK in Functions project.

Deliverable: auth-ready project + base Firebase wiring.

### Phase 2: Frontend Auth Cutover

- Replace custom `/auth/*` calls with Firebase Auth SDK calls.
- Store Firebase ID token in memory/session.
- Add role/permission fetch from authProfiles document.
- Remove backend JWT dependency from frontend.

Deliverable: users can register/login/anonymous via Firebase.

### Phase 3: Core Product Functions

Implement Cloud Functions for:

- intake plan generation
- plan retrieval
- session completion + bandit update

Persist results into Firestore collections.

Deliverable: core user journey works fully via Firebase.

### Phase 4: Admin + Safety Functions

Implement admin endpoints in Functions:

- flags list/resolve/triage
- safety escalation event creation
- queue/dead-letter list/replay/drop/purge
- replay audit trails

Enforce RBAC using Firebase custom claims + authProfiles permissions.

Deliverable: admin operations parity.

### Phase 5: Worker and Scheduling Migration

- Replace Redis queue with Pub/Sub topics.
- Replace worker process with Pub/Sub-triggered Functions.
- Replace scheduler tick with Cloud Scheduler -> HTTP Function.
- On retries exceeded, write to deadLetterJobs collection.

Deliverable: async processing and retry/dead-letter parity.

### Phase 6: Notifications + Analytics

- Notification send Function supporting in-app/webhook/email.
- Notification logs persisted in Firestore.
- Analytics Functions:
  - actions
  - users
  - notifications (status/source/channel/day/failure reasons)
  - worker metrics
- CSV export endpoints from Functions.

Deliverable: observability parity.

### Phase 7: Frontend Admin UI Rewire

- Repoint admin API layer to Cloud Functions endpoints.
- Verify all existing admin panels continue to work.
- Keep UI stable; backend source changes only.

Deliverable: existing UI + Firebase backend.

### Phase 8: Deploy + Hardening

- Deploy Functions and Firestore indexes/rules.
- Deploy frontend to GitHub Pages.
- Add monitoring/alerts and budgets in Google Cloud.
- Run smoke checklist for all flows.

Deliverable: production-ready Firebase deployment.

## Security Model

- Firebase Auth for identity.
- Custom claims for admin role (`admin: true`).
- Fine-grained permissions in `authProfiles/{userId}`.
- Firestore Security Rules to block non-admin reads/writes for admin collections.
- Cloud Functions verify claims before mutating admin resources.

## Cost / Free-Tier Notes

- Firebase Spark free tier has limits (Functions invocations, Firestore reads/writes, auth MAU).
- Heavy worker/scheduler throughput can exceed free tier.
- Start with low-traffic defaults and add budget alerts in GCP.

## Rollout Strategy (Safe)

- Build Firebase path in parallel first.
- Keep existing backend active until Firebase parity passes tests.
- Use feature flag in frontend to switch API provider.
- Cut traffic gradually, then decommission old backend.

## Immediate Next Steps

1. Create `firebase/` functions workspace (TypeScript).
2. Add Firebase client auth wiring to frontend.
3. Implement first three Functions: `intake`, `plan_get`, `session_complete`.
4. Add Firestore rules + emulator tests.
5. Run side-by-side verification against current backend behavior.
