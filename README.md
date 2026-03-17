<div align="center">

# 🧭 Path101

**Behavior-change micro-intervention platform for students**

An evidence-based system that helps students overcome procrastination, anxiety, and poor study habits through personalized micro-sessions, adaptive recommendations, and real-time safety monitoring.

[![CI](https://github.com/arif481/Path101/actions/workflows/ci.yml/badge.svg)](https://github.com/arif481/Path101/actions)
[![Firebase](https://img.shields.io/badge/Firebase-Spark%20Plan-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎯 **Smart Intake** | NLP keyword classification maps free-text concerns to evidence-based BCT modules |
| 🧠 **Adaptive Bandit** | Epsilon-greedy multi-armed bandit learns which session type works best per user |
| 🛡️ **Safety Triage** | Real-time crisis language detection with severity scoring and admin escalation |
| 📊 **Admin Dashboard** | Full RBAC-protected panel for safety flags, dead-letter queue, analytics, and notifications |
| ⏰ **Session Nudges** | Automated reminders via GitHub Actions cron with distributed dedup locks |
| 📱 **Responsive UI** | React + TypeScript SPA with anonymous and email auth |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser (React)                │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌───────────────┐   │
│  │Firebase  │  │ Intake   │  │ Bandit Policy │   │
│  │Auth SDK  │  │ Service  │  │ (ε-greedy)    │   │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘   │
│       │              │               │            │
│  ┌────▼──────────────▼───────────────▼────────┐   │
│  │         Firestore SDK (reads/writes)       │   │
│  └────────────────────┬───────────────────────┘   │
└───────────────────────┼───────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Cloud Firestore  │   ← Spark Plan (free)
              │  Firebase Auth    │   ← 50K MAU free
              └───────────────────┘
                        ▲
              ┌─────────┴─────────┐
              │  GitHub Actions   │   ← Scheduler cron
              │  (scheduler-tick) │     (free)
              └───────────────────┘
```

**Zero server cost** — all business logic runs client-side. Firebase Spark plan (no credit card needed).

## 📁 Project Structure

```
Path101/
├── frontend/                    # React + TypeScript SPA
│   └── src/
│       ├── firebase/
│       │   ├── config.ts        # Firebase SDK init + emulator support
│       │   ├── authService.ts   # Auth (anon, email, password reset)
│       │   ├── useAuth.ts       # React auth hook
│       │   ├── firebaseApi.ts   # API layer (feature-flag switchable)
│       │   └── services/
│       │       ├── intakeService.ts   # Keyword classification + plan gen
│       │       ├── banditService.ts   # ε-greedy recommendation engine
│       │       ├── safetyService.ts   # Crisis language detection
│       │       ├── firestoreOps.ts    # Firestore CRUD for all collections
│       │       └── adminService.ts    # Admin panel operations
│       ├── api.ts               # Legacy REST API layer
│       └── types.ts             # TypeScript interfaces
├── backend/                     # FastAPI (legacy, still functional)
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── routers/             # REST endpoints
│   │   ├── services/            # Business logic (Python)
│   │   └── models/              # SQLAlchemy ORM models
│   └── tests/                   # pytest test suite (7 files)
├── firebase/
│   ├── firebase.json            # Hosting + Firestore config
│   ├── firestore.rules          # Security rules (RBAC)
│   └── firestore.indexes.json   # Composite query indexes
├── scripts/
│   └── scheduler-tick.ts        # GitHub Actions nudge scanner
└── .github/workflows/
    └── scheduler-tick.yml       # Cron job (every 15 min)
```

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- A [Firebase project](https://console.firebase.google.com) (free Spark plan)

### 1. Clone & Install

```bash
git clone https://github.com/arif481/Path101.git
cd Path101/frontend
npm install
```

### 2. Configure Firebase

```bash
cp .env.example .env
```

Edit `.env` with your Firebase project config:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_USE_FIREBASE=true
```

### 3. Firebase Setup

In the [Firebase Console](https://console.firebase.google.com):

1. **Authentication** → Enable **Email/Password** and **Anonymous** sign-in
2. **Firestore** → Create database in **production mode**

Deploy security rules and indexes:

```bash
npm install -g firebase-tools
firebase login
cd firebase && firebase deploy --only firestore
```

### 4. Run Locally

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 5. Deploy

```bash
cd frontend && npm run build
cd ../firebase && firebase deploy --only hosting
```

## 🧪 Testing

```bash
# Frontend
cd frontend && npm test

# Legacy backend (still works)
cd backend && python -m pytest tests/ -q
```

## 🔒 Security Model

| Collection | User Access | Admin Access |
|---|---|---|
| `users/{uid}` | Own data only | Full |
| `plans/{planId}` | Own plans only | Full |
| `sessions/{sid}` | Own sessions only | Full |
| `safetyFlags` | Create only | Full CRUD |
| `deadLetterJobs` | — | Full CRUD |
| `notificationLogs` | Own notifications | Full |
| `workerMetrics` | — | Read only |

Admin access is granted via Firebase Auth custom claims:

```bash
firebase auth:set-custom-user-claims <UID> '{"admin": true}'
```

## 🔄 Feature Flag

The app supports dual-mode operation via environment variable:

| `VITE_USE_FIREBASE` | Behavior |
|---|---|
| `true` | All operations use Firebase (Firestore + Auth) |
| `false` | Falls back to legacy REST API backend |

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
