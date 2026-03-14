import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.config import AUTO_MIGRATE, CORS_ORIGINS, SETTINGS, TRUSTED_HOSTS, validate_startup_settings
from app.db import Base, engine
from app.middleware import RequestContextMiddleware
from app.models import db_models  # noqa: F401
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.intake import router as intake_router
from app.routers.plan import router as plan_router
from app.routers.session import router as session_router

app = FastAPI(
    title="Path101 API",
    version="0.1.0",
    description="MVP API for rule-first behavior change planning",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)
app.add_middleware(RequestContextMiddleware)


@app.on_event("startup")
def startup() -> None:
    logging.basicConfig(level=logging.INFO)
    validate_startup_settings(SETTINGS)

    if AUTO_MIGRATE:
        logging.warning("AUTO_MIGRATE is enabled; prefer Alembic migrations for managed environments")
        Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(intake_router)
app.include_router(plan_router)
app.include_router(session_router)
app.include_router(auth_router)
app.include_router(admin_router)
