# Path101 MVP

Initial implementation of the behavior-change app foundation:
- `frontend/`: React + TypeScript app for intake, plan preview, and session completion.
- `backend/`: FastAPI service with rule-first intake parsing, SMART goal shaping, plan compilation, and safety triage trigger.

## Local run

### 1) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Optional DB configuration:

```bash
cp .env.example .env
# edit DATABASE_URL if using PostgreSQL
# set JWT_SECRET and ADMIN_EMAIL_ALLOWLIST
```

Create a new migration after model changes:

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

API docs: http://127.0.0.1:8000/docs

Optional local Redis (for queue/scheduler health and jobs):

```bash
sudo apt update
sudo apt install redis-server -y
sudo systemctl enable --now redis-server
redis-cli ping
```

Run worker locally (separate terminal):

```bash
cd backend
source .venv/bin/activate
python -m app.worker
```

Worker scheduler settings (optional):

- `SCHEDULER_INTERVAL_SECONDS` (default `60`)
- `NUDGE_LOOKAHEAD_MINUTES` (default `30`)
- `NUDGE_LOOKBACK_HOURS` (default `24`)
- `NUDGE_LOCK_TTL_SECONDS` (default `86400`)
- `BANDIT_EPSILON` (default `0.2`)
- `BANDIT_MIN_HISTORY` (default `3`)
- `AUTH_RATE_LIMIT_COUNT` / `AUTH_RATE_LIMIT_WINDOW_SECONDS`
- `ADMIN_RATE_LIMIT_COUNT` / `ADMIN_RATE_LIMIT_WINDOW_SECONDS`
- `WORKER_MAX_RETRIES` (default `3`)
- `NOTIFICATION_CHANNELS` (default `in_app,email`)

The worker scans for incomplete sessions scheduled in the configured window and enqueues `session_nudge` jobs with Redis dedupe locks.
Failed worker jobs are retried up to `WORKER_MAX_RETRIES` and then moved to a Redis dead-letter queue.
Session completion recommendations use an epsilon-greedy bandit policy (`recovery_10`, `focus_15`, `deep_20`) with cold-start exploration and feedback guardrails.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://127.0.0.1:5173

## Tests and CI

Backend tests:

```bash
cd backend
source .venv/bin/activate
pytest -q
```

Frontend checks:

```bash
cd frontend
npm run test
npm run build
```

GitHub Actions runs both backend and frontend checks on push/PR to `main`.

## Implemented endpoints

- `POST /auth/anonymous`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `GET /auth/me`
- `POST /intake`
- `GET /plan/{user_id}`
- `POST /session/{session_id}/complete`
- `GET /admin/flags` (requires admin Bearer token)
- `POST /admin/flag/{id}/resolve` (requires admin Bearer token)
- `POST /admin/flag/{id}/triage` (requires admin Bearer token)
- `GET /admin/safety-escalations` (requires admin Bearer token + permission)
- `GET /admin/flags/analytics` (requires admin Bearer token)
- `GET /admin/queue-health` (requires admin Bearer token)
- `GET /admin/notifications` (requires admin Bearer token)
- `POST /admin/notifications/test-send` (requires admin Bearer token)
- `GET /admin/notifications/analytics` and `GET /admin/notifications/analytics.csv` (requires admin Bearer token)
- `GET /admin/dead-letter-jobs` (requires admin Bearer token)
- `POST /admin/dead-letter-jobs/{dead_letter_id}/replay` (requires admin Bearer token)
- `POST /admin/dead-letter-jobs/{dead_letter_id}/drop` (requires admin Bearer token)
- `POST /admin/dead-letter-jobs/replay-bulk` (requires admin Bearer token)
- `POST /admin/dead-letter-jobs/drop-bulk` (requires admin Bearer token)
- `GET /admin/dead-letter-summary` (requires admin Bearer token)
- `POST /admin/dead-letter-jobs/purge` (requires admin Bearer token)
- `GET /admin/dead-letter-replays` and `GET /admin/dead-letter-replays.csv` (requires admin Bearer token)
- `GET /admin/dead-letter-replays/filter` (requires admin Bearer token)
- `GET /admin/analytics/actions` and `GET /admin/analytics/users` (requires admin Bearer token)
- `GET /admin/worker-metrics` (requires admin Bearer token + permission)
- `POST /admin/maintenance/retention` (requires admin Bearer token + permission)
- `GET /admin/rbac/{user_id}` and `POST /admin/rbac/{user_id}` (requires admin Bearer token + permission)
- `GET /health`

## Notes

- Current storage is SQLAlchemy-backed (`sqlite` by default, PostgreSQL-ready via `DATABASE_URL`).
- Crisis-like language triggers triage messaging and safety flag behavior stub.
- Safety triage now includes severity scoring with escalation statuses (`none`, `watch`, `escalated`, `urgent`) and admin review lifecycle fields.
- Notification delivery now supports concrete channel handlers (`in_app`, `email` via SMTP, `webhook`) with persisted failures.
- Notification analytics includes delivery-rate plus channel/source/status/day/failure-reason breakdowns with CSV export.
- Auth now includes refresh-token rotation, logout revocation, and password-reset token lifecycle.
- Admin RBAC is scoped by role+permissions and enforced per endpoint.
- Worker metrics and retention maintenance endpoints support operational alerts and data lifecycle controls.

## Deploy (Render blueprint)

This repo includes `render.yaml` for backend API, backend worker, and static frontend services.

### 1) Push latest code to GitHub

```bash
git push origin main
```

### 2) Create services in Render

- In Render dashboard choose **New +** → **Blueprint**.
- Connect your GitHub repo and select branch `main`.
- Render will detect `render.yaml` and create:
	- `path101-api` (FastAPI)
	- `path101-worker` (Redis queue consumer)
	- `path101-web` (Vite static site)

### 3) Set environment variables

For `path101-api`:
- `DATABASE_URL` = your production PostgreSQL URL
- `APP_ENV` = `production`
- `AUTO_MIGRATE` = `false` (recommended in production)
- `JWT_SECRET` = long random string
- `ADMIN_EMAIL_ALLOWLIST` = comma-separated admin login emails (e.g. `admin@yourdomain.com`)
- `REDIS_URL` = your Redis instance URL
- `CORS_ORIGINS` = frontend URL(s), comma-separated (e.g. `https://path101-web.onrender.com`)
- `TRUSTED_HOSTS` = backend host(s), comma-separated (e.g. `path101-api.onrender.com`)

For `path101-web`:
- `VITE_API_BASE_URL` = deployed backend URL (e.g. `https://path101-api.onrender.com`)

### 4) Redeploy frontend after setting `VITE_API_BASE_URL`

- In Render `path101-web` service, click **Manual Deploy** → **Deploy latest commit**.

### 5) Post-deploy checks

- Backend health: `GET /health`
- Frontend loads and can:
	- continue anonymously
	- register/login
	- create intake plan

## Production hardening notes

- The API now validates critical settings at startup when `APP_ENV=production`.
- Use Alembic migrations (`alembic upgrade head`) for schema changes in all managed environments.
- `AUTO_MIGRATE` is opt-in and defaults to `false`; leave it disabled in production.
- CORS and trusted hosts are environment-driven (`CORS_ORIGINS`, `TRUSTED_HOSTS`).
- Request rate limiting is Redis-backed when `REDIS_URL` is available, with in-memory fallback for local resilience.
- Worker nudge jobs emit notification delivery logs (`delivered`/`failed`) based on `NOTIFICATION_CHANNELS`.
