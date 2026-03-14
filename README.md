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
