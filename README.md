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
uvicorn app.main:app --reload
```

Optional DB configuration:

```bash
cp .env.example .env
# edit DATABASE_URL if using PostgreSQL
# set JWT_SECRET and ADMIN_API_KEY
```

API docs: http://127.0.0.1:8000/docs

Optional local Redis (for queue/scheduler health and jobs):

```bash
sudo apt update
sudo apt install redis-server -y
sudo systemctl enable --now redis-server
redis-cli ping
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://127.0.0.1:5173

## Implemented endpoints

- `POST /auth/anonymous`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /intake`
- `GET /plan/{user_id}`
- `POST /session/{session_id}/complete`
- `GET /admin/flags` (requires `X-Admin-Key`)
- `POST /admin/flag/{id}/resolve` (requires `X-Admin-Key`)
- `GET /admin/queue-health` (requires `X-Admin-Key`)
- `GET /health`

## Notes

- Current storage is SQLAlchemy-backed (`sqlite` by default, PostgreSQL-ready via `DATABASE_URL`).
- Crisis-like language triggers triage messaging and safety flag behavior stub.
- Next step is frontend auth integration, recurring scheduler worker, and bandit policy service.

## Deploy (Render blueprint)

This repo includes `render.yaml` for one backend web service and one static frontend service.

### 1) Push latest code to GitHub

```bash
git push origin main
```

### 2) Create services in Render

- In Render dashboard choose **New +** → **Blueprint**.
- Connect your GitHub repo and select branch `main`.
- Render will detect `render.yaml` and create:
	- `path101-api` (FastAPI)
	- `path101-web` (Vite static site)

### 3) Set environment variables

For `path101-api`:
- `DATABASE_URL` = your production PostgreSQL URL
- `APP_ENV` = `production`
- `AUTO_MIGRATE` = `false` (recommended in production)
- `JWT_SECRET` = long random string
- `ADMIN_API_KEY` = long random string
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
- Avoid `AUTO_MIGRATE=true` in production after initial bootstrap; use migrations workflow.
- CORS and trusted hosts are environment-driven (`CORS_ORIGINS`, `TRUSTED_HOSTS`).
