# Path101

Path101 is an AI-generated student success operating system.

It is meant to build whatever a student needs to achieve a goal: roadmap, execution system, study structure, habit support, wellbeing support, progress visuals, and adaptive check-ins. Mental health is part of the product when it affects capacity, but the app is not a mental-health-only tool.

## Product direction

Path101 should:

- understand the student across goals, time, pressure, habits, energy, and support needs
- generate a custom workspace instead of forcing a fixed feature flow
- keep progress highly visual with milestone arcs, action lanes, and momentum signals
- adapt the system over time through check-ins and AI insight

## Current app shape

The frontend now centers on four layers:

1. Goal intake
2. AI analysis of the student context
3. Generated workspace with milestones, actions, modules, and progress dials
4. Adaptive support through check-ins and chat

## Stack

- React + TypeScript + Vite
- Firebase Auth
- Cloud Firestore
- Gemini 2.5 Flash

## Key files

```text
frontend/src/
├── App.tsx                         # Main student OS experience
├── styles.css                      # Visual system, layout, motion, responsive design
├── types/workspace.ts              # Shared workspace contracts
└── firebase/services/
    ├── aiService.ts                # AI analysis, workspace generation, insight, chat
    └── firestoreOps.ts             # Firestore persistence for workspaces and progress
```

## Local development

```bash
cd frontend
npm install
npm run dev
```

## Environment

Create `frontend/.env` from `frontend/.env.example` and provide:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_GEMINI_API_KEY=...
VITE_USE_FIREBASE=true
```

If `VITE_GEMINI_API_KEY` is missing, the app falls back to deterministic local workspace generation so the UI still works in development.

## Testing

```bash
cd frontend
npm run typecheck
npm run test
npm run build
```

## Firestore model

Primary collections:

- `users`
- `authProfiles`
- `workspaces`
- `checkIns`
- `progressEvents`
- `safetyFlags`
- `safetyEscalationEvents`
- `notificationLogs`

## Notes

- The workspace is intentionally generated from reusable primitives rather than a hard-coded product menu.
- Firestore rules in `firebase/firestore.rules` are aligned to the new `workspaces/checkIns/progressEvents` model.
- The old counseling-first flow has been replaced by a broader student-goal system.
