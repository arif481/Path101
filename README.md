<div align="center">

# 🧭 Path101

**AI-powered personal growth companion for students**

[![CI](https://github.com/arif481/Path101/actions/workflows/ci.yml/badge.svg)](https://github.com/arif481/Path101/actions/workflows/ci.yml)
[![Firebase](https://img.shields.io/badge/Powered%20by-Firebase-FFCA28?logo=firebase)](https://firebase.google.com)
[![Gemini](https://img.shields.io/badge/Gemini%202.0-Flash-4285F4?logo=google)](https://aistudio.google.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org)

**[Live App →](https://path101.web.app)**

</div>

---

## What is Path101?

Path101 is an **AI-first behavior-change platform** that helps students overcome procrastination, anxiety, and poor study habits through personalized micro-sessions powered by **Google Gemini AI**.

Unlike template-based apps, **everything is generated dynamically** based on what you tell it. No pre-made plans, no generic advice — just real, personalized guidance.

### How it works

```
You share what's going on
        ↓
🧠 AI deeply analyzes your concerns, emotional state, and severity
        ↓
📋 Generates a fully personalized multi-week plan with specific sessions
        ↓
🏃 Guides you through each session step with real-time AI coaching
        ↓
🪞 Provides personalized reflection, mood interpretation, and journal prompts
        ↓
📊 Tracks your progress and gives AI-powered insights over time
```

### Features

| Feature | Description |
|---|---|
| 🧠 **AI Analysis** | Gemini understands your concerns, emotional state, and severity |
| 📋 **Dynamic Plans** | Every plan is unique — generated from your specific situation |
| 🏃 **Guided Sessions** | Step-by-step AI coaching during each micro-session |
| 🪞 **AI Reflections** | Personalized insights, mood interpretation, and journal prompts |
| 📊 **Progress Tracking** | AI-analyzed trends, strengths, and focus areas |
| 💬 **AI Chat** | Talk to Path101 anytime for advice and support |
| 🛡️ **Safety Detection** | Crisis language triggers immediate safety resources |
| 🔐 **Auth** | Google, email/password, or anonymous sign-in |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Browser (React + TypeScript)        │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Firebase  │  │ Gemini   │  │  Firestore   │  │
│  │   Auth    │  │ 2.0 Flash│  │  (Database)  │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
```

**100% client-side** — no backend server. All AI calls go directly to Gemini API. All data persists in Firestore with security rules.

**Cost: $0/month** (Firebase Spark plan + Gemini free tier)

---

## Project Structure

```
Path101/
├── frontend/                 # React + TypeScript + Vite
│   └── src/
│       ├── App.tsx           # Main app (7 AI-driven views)
│       ├── styles.css        # Premium dark-mode design system
│       └── firebase/
│           ├── config.ts     # Firebase initialization
│           ├── authService.ts # Auth (Google, email, anonymous)
│           ├── useAuth.ts    # React auth hook
│           └── services/
│               ├── aiService.ts       # 🧠 Gemini AI core engine
│               ├── firestoreOps.ts    # Database operations
│               ├── safetyService.ts   # Crisis detection
│               ├── intakeService.ts   # Intake helpers
│               ├── banditService.ts   # Recommendation engine
│               └── adminService.ts    # Admin operations
├── firebase/
│   ├── firestore.rules       # Security rules (13 collections)
│   └── firestore.indexes.json
├── .github/workflows/
│   ├── ci.yml                # CI: test + build
│   └── scheduler-tick.yml    # Cron scheduler (optional)
└── scripts/
    └── scheduler-tick.ts     # Nudge scheduler (GitHub Actions)
```

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/arif481/Path101.git
cd Path101/frontend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your keys:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GEMINI_API_KEY=...       # Free from aistudio.google.com
VITE_USE_FIREBASE=true
```

### 3. Run locally

```bash
npm run dev
```

### 4. Deploy

```bash
npm run build
cp -r dist ../firebase/public
cd ../firebase && firebase deploy --only hosting
```

---

## Security

- **Firestore Rules** — 13 collections with owner-based access control
- **Auth** — Firebase Auth SDK (Google, email/password, anonymous)
- **API Keys** — All sensitive keys stored in GitHub Secrets and `.env` (gitignored)
- **Safety** — AI-powered crisis detection with safety escalation pipeline

---

## License

MIT © [arif481](https://github.com/arif481)
