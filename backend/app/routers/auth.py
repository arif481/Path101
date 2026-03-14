from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import (
    AnonymousAuthResponse,
    AuthTokenResponse,
    LoginRequest,
    MeResponse,
    RegisterRequest,
)
from app.security import auth_rate_limit, create_access_token, get_current_user
from app.models.db_models import AuthAccount
from app.services.auth_service import create_anonymous_user, login_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/anonymous", response_model=AnonymousAuthResponse)
def auth_anonymous(
    _: None = Depends(auth_rate_limit),
    db: Session = Depends(get_db),
) -> AnonymousAuthResponse:
    user = create_anonymous_user(db)
    token = create_access_token(user.id, is_admin=False)
    db.commit()
    return AnonymousAuthResponse(
        access_token=token,
        user_id=user.id,
        anonymous=True,
        is_admin=False,
        anon_id=user.anon_id or "",
    )


@router.post("/register", response_model=AuthTokenResponse)
def auth_register(
    payload: RegisterRequest,
    _: None = Depends(auth_rate_limit),
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    try:
        user = register_user(db, payload.email, payload.password)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    account = db.get(AuthAccount, user.id)
    is_admin = bool(account and account.is_admin)
    token = create_access_token(user.id, is_admin=is_admin)
    db.commit()
    return AuthTokenResponse(access_token=token, user_id=user.id, anonymous=False, is_admin=is_admin)


@router.post("/login", response_model=AuthTokenResponse)
def auth_login(
    payload: LoginRequest,
    _: None = Depends(auth_rate_limit),
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    try:
        user = login_user(db, payload.email, payload.password)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error

    account = db.get(AuthAccount, user.id)
    is_admin = bool(account and account.is_admin)
    token = create_access_token(user.id, is_admin=is_admin)
    db.commit()
    return AuthTokenResponse(access_token=token, user_id=user.id, anonymous=bool(user.anon_id), is_admin=is_admin)


@router.get("/me", response_model=MeResponse)
def auth_me(user=Depends(get_current_user)) -> MeResponse:
    account = user.auth_account
    is_admin = bool(account and account.is_admin)
    return MeResponse(user_id=user.id, anonymous=bool(user.anon_id), is_admin=is_admin, created_at=user.created_at)
