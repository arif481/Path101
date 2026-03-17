# Path101 Deployment Runbook (Production)

## 1) Required credentials/secrets

Populate these in Render secrets (never commit):

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL_ALLOWLIST`
- `CORS_ORIGINS`
- `TRUSTED_HOSTS`
- `VITE_API_BASE_URL`
- Optional but recommended:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASSWORD`
  - `SMTP_FROM_EMAIL`
  - `NOTIFICATION_WEBHOOK_URL`

## 2) One-time setup

1. Push latest main branch.
2. In Render, create a Blueprint deployment from `render.yaml`.
3. Set env vars for services:
   - `path101-api`
   - `path101-worker`
   - `path101-web`
4. Trigger deploy.

## 3) Post-deploy verification

### API health

- `GET /health` should return `{"status":"ok"}`.

### Auth lifecycle

- Register user with `POST /auth/register`.
- Login with `POST /auth/login`.
- Refresh with `POST /auth/refresh`.
- Logout with `POST /auth/logout`.

### Core product

- `POST /intake` returns plan preview.
- `POST /session/{session_id}/complete` returns recommendation.

### Admin operations

- `GET /admin/queue-health`
- `GET /admin/dead-letter-jobs`
- `GET /admin/notifications/analytics`
- `GET /admin/worker-metrics`
- `POST /admin/scheduler/tick`

### Maintenance

- `POST /admin/maintenance/retention` using safe test window first.

## 4) Suggested production defaults

- `APP_ENV=production`
- `AUTO_MIGRATE=false`
- `JWT_EXPIRES_MINUTES=10080`
- `REFRESH_EXPIRES_DAYS=30`
- `WORKER_MAX_RETRIES=3`
- `WORKER_ALERT_FAILURE_RATE=0.20`
- `NOTIFICATION_CHANNELS=in_app,email,webhook`

## 5) Rollback strategy

- Keep previous successful Render deploy as rollback target.
- Use DB backups before schema-affecting deploys.
- If deploy fails: rollback app deploy first, then restore DB only if migration caused incompatibility.
