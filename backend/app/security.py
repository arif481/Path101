from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import (
    ADMIN_RATE_LIMIT_COUNT,
    ADMIN_RATE_LIMIT_WINDOW_SECONDS,
    AUTH_RATE_LIMIT_COUNT,
    AUTH_RATE_LIMIT_WINDOW_SECONDS,
    JWT_ALGORITHM,
    JWT_EXPIRES_MINUTES,
    JWT_SECRET,
)
from app.db import get_db
from app.models.db_models import AuthAccount, User
from app.services.rate_limiter import rate_limiter


ADMIN_PERMISSION_GROUPS = {
    "flags:read",
    "flags:write",
    "dead_letter:read",
    "dead_letter:write",
    "notifications:read",
    "notifications:write",
    "analytics:read",
    "scheduler:run",
    "maintenance:write",
    "worker:read",
}


class AuthError(HTTPException):
    def __init__(self, detail: str = "Unauthorized") -> None:
        super().__init__(status_code=401, detail=detail)


def hash_email(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


def hash_password(password: str, salt: str | None = None) -> str:
    used_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), used_salt.encode("utf-8"), 120_000)
    return f"{used_salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if "$" not in stored_hash:
        return False
    salt, expected = stored_hash.split("$", 1)
    candidate = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate, expected)


def create_access_token(user_id: str, is_admin: bool = False) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRES_MINUTES)
    payload = {"sub": user_id, "is_admin": is_admin, "exp": expires_at}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise AuthError("Invalid token payload")
        return user_id
    except jwt.PyJWTError as error:
        raise AuthError("Invalid or expired token") from error


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthError("Missing authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthError("Expected Bearer token")
    return token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_bearer_token(authorization)
    user_id = decode_access_token(token)
    user = db.get(User, user_id)
    if user is None:
        raise AuthError("User not found")
    return user


def get_current_admin_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_bearer_token(authorization)
    user_id = decode_access_token(token)
    user = db.get(User, user_id)
    if user is None:
        raise AuthError("User not found")

    account = db.get(AuthAccount, user_id)
    if account is None or not account.is_admin:
        raise AuthError("Admin privileges required")

    return user


def get_admin_role_permissions(account: AuthAccount | None) -> tuple[str, list[str]]:
    if account is None or not account.is_admin:
        return ("user", [])

    role = (account.role or "admin").strip().lower()
    configured = account.permissions_json if isinstance(account.permissions_json, dict) else {}
    permission_values = configured.get("permissions") if isinstance(configured, dict) else None
    permissions = [str(item).strip().lower() for item in (permission_values or []) if str(item).strip()]
    if not permissions:
        permissions = sorted(ADMIN_PERMISSION_GROUPS)
    return (role, permissions)


def require_admin_permission(permission: str):
    permission_key = permission.strip().lower()

    def _check(
        admin_user: User = Depends(get_current_admin_user),
        db: Session = Depends(get_db),
    ) -> User:
        account = db.get(AuthAccount, admin_user.id)
        _, permissions = get_admin_role_permissions(account)
        if permission_key not in set(permissions):
            raise HTTPException(status_code=403, detail="Admin permission denied")
        return admin_user

    return _check


def _request_client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def auth_rate_limit(request: Request) -> None:
    key = f"auth:{_request_client_key(request)}"
    allowed = rate_limiter.allow(
        key=key,
        limit=AUTH_RATE_LIMIT_COUNT,
        window_seconds=AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many auth requests")


def admin_rate_limit(request: Request, user: User = Depends(get_current_admin_user)) -> None:
    key = f"admin:{user.id}:{_request_client_key(request)}"
    allowed = rate_limiter.allow(
        key=key,
        limit=ADMIN_RATE_LIMIT_COUNT,
        window_seconds=ADMIN_RATE_LIMIT_WINDOW_SECONDS,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many admin requests")
