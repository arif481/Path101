from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import (
    AuthLogoutRequest,
    AnonymousAuthResponse,
    AuthTokenResponse,
    LoginRequest,
    MeResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RefreshTokenRequest,
    RegisterRequest,
)
from app.security import auth_rate_limit, create_access_token, get_admin_role_permissions, get_current_user
from app.models.db_models import AuthAccount, User
from app.services.auth_service import (
    create_anonymous_user,
    create_password_reset_token,
    create_refresh_token,
    login_user,
    register_user,
    reset_password_with_token,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/anonymous", response_model=AnonymousAuthResponse)
def auth_anonymous(
    _: None = Depends(auth_rate_limit),
    db: Session = Depends(get_db),
) -> AnonymousAuthResponse:
    user = create_anonymous_user(db)
    refresh_token = create_refresh_token(db, user.id)
    token = create_access_token(user.id, is_admin=False)
    db.commit()
    return AnonymousAuthResponse(
        access_token=token,
        refresh_token=refresh_token,
        user_id=user.id,
        anonymous=True,
        is_admin=False,
        role="user",
        permissions=[],
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
    role, permissions = get_admin_role_permissions(account)
    token = create_access_token(user.id, is_admin=is_admin)
    refresh_token = create_refresh_token(db, user.id)
    db.commit()
    return AuthTokenResponse(
        access_token=token,
        refresh_token=refresh_token,
        user_id=user.id,
        anonymous=False,
        is_admin=is_admin,
        role=role,
        permissions=permissions,
    )


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
    role, permissions = get_admin_role_permissions(account)
    token = create_access_token(user.id, is_admin=is_admin)
    refresh_token = create_refresh_token(db, user.id)
    db.commit()
    return AuthTokenResponse(
        access_token=token,
        refresh_token=refresh_token,
        user_id=user.id,
        anonymous=bool(user.anon_id),
        is_admin=is_admin,
        role=role,
        permissions=permissions,
    )


@router.post("/refresh", response_model=AuthTokenResponse)
def auth_refresh(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> AuthTokenResponse:
    try:
        user_id, rotated_refresh_token = rotate_refresh_token(db, payload.refresh_token)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    account = db.get(AuthAccount, user_id)
    is_admin = bool(account and account.is_admin)
    role, permissions = get_admin_role_permissions(account)
    token = create_access_token(user_id, is_admin=is_admin)
    db.commit()
    return AuthTokenResponse(
        access_token=token,
        refresh_token=rotated_refresh_token,
        user_id=user_id,
        anonymous=bool(user.anon_id),
        is_admin=is_admin,
        role=role,
        permissions=permissions,
    )


@router.post("/logout")
def auth_logout(payload: AuthLogoutRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    revoke_refresh_token(db, payload.refresh_token)
    db.commit()
    return {"status": "ok"}


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def auth_password_reset_request(
    payload: PasswordResetRequest,
    _: None = Depends(auth_rate_limit),
    db: Session = Depends(get_db),
) -> PasswordResetRequestResponse:
    reset_token = create_password_reset_token(db, payload.email)
    db.commit()
    return PasswordResetRequestResponse(status="ok", reset_token=reset_token)


@router.post("/password-reset/confirm")
def auth_password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    _: None = Depends(auth_rate_limit),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    try:
        reset_password_with_token(db, payload.reset_token, payload.new_password)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    db.commit()
    return {"status": "ok"}


@router.get("/me", response_model=MeResponse)
def auth_me(user=Depends(get_current_user)) -> MeResponse:
    account = user.auth_account
    is_admin = bool(account and account.is_admin)
    role, permissions = get_admin_role_permissions(account)
    return MeResponse(
        user_id=user.id,
        anonymous=bool(user.anon_id),
        is_admin=is_admin,
        role=role,
        permissions=permissions,
        created_at=user.created_at,
    )
