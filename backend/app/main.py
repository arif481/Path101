from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(intake_router)
app.include_router(plan_router)
app.include_router(session_router)
app.include_router(auth_router)
app.include_router(admin_router)
