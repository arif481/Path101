from __future__ import annotations

import secrets
from datetime import datetime, timedelta
import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL_ALLOWLIST, REFRESH_EXPIRES_DAYS
from app.models.db_models import AuthAccount, PasswordResetToken, RefreshToken, User
from app.security import hash_email, hash_password, verify_password


DEFAULT_ADMIN_PERMISSIONS = [
    "analytics:read",
    "dead_letter:read",
    "dead_letter:write",
    "flags:read",
    "flags:write",
    "maintenance:write",
    "notifications:read",
    "notifications:write",
    "scheduler:run",
    "worker:read",
]


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _is_admin_email(email: str) -> bool:
    return email.strip().lower() in set(ADMIN_EMAIL_ALLOWLIST)


def create_anonymous_user(db: Session) -> User:
    user_id = f"user_{secrets.token_hex(10)}"
    anon_id = f"anon_{secrets.token_hex(8)}"
    user = User(
        id=user_id,
        created_at=datetime.utcnow(),
        anon_id=anon_id,
        consent_flags={},
    )
    db.add(user)
    db.flush()
    return user


def register_user(db: Session, email: str, password: str) -> User:
    email_digest = hash_email(email)
    existing = db.scalar(select(AuthAccount).where(AuthAccount.email_hash == email_digest))
    if existing is not None:
        raise ValueError("An account already exists for this email")

    normalized_email = email.strip().lower()
    user = User(
        id=f"user_{secrets.token_hex(10)}",
        created_at=datetime.utcnow(),
        email_hash=email_digest,
        consent_flags={},
    )
    db.add(user)
    db.flush()

    auth_account = AuthAccount(
        user_id=user.id,
        email_hash=email_digest,
        email_address=normalized_email,
        password_hash=hash_password(password),
        is_admin=_is_admin_email(email),
        role="super_admin" if _is_admin_email(email) else "user",
        permissions_json={
            "permissions": DEFAULT_ADMIN_PERMISSIONS if _is_admin_email(email) else [],
        },
        created_at=datetime.utcnow(),
    )
    db.add(auth_account)
    db.flush()
    return user


def login_user(db: Session, email: str, password: str) -> User:
    email_digest = hash_email(email)
    account = db.scalar(select(AuthAccount).where(AuthAccount.email_hash == email_digest))
    if account is None or not verify_password(password, account.password_hash):
        raise ValueError("Invalid email or password")

    user = db.get(User, account.user_id)
    if user is None:
        raise ValueError("User not found")

    if _is_admin_email(email) and not account.is_admin:
        account.is_admin = True
        account.role = "super_admin"
        account.permissions_json = {"permissions": DEFAULT_ADMIN_PERMISSIONS}
        db.add(account)
        db.flush()

    return user


def create_refresh_token(db: Session, user_id: str) -> str:
    raw_token = f"rt_{secrets.token_urlsafe(48)}"
    token_hash = _hash_token(raw_token)
    row = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        revoked=False,
        expires_at=datetime.utcnow() + timedelta(days=max(1, REFRESH_EXPIRES_DAYS)),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return raw_token


def rotate_refresh_token(db: Session, refresh_token: str) -> tuple[str, str]:
    token_hash = _hash_token(refresh_token)
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if row is None or row.revoked or row.expires_at <= datetime.utcnow():
        raise ValueError("Invalid refresh token")

    row.revoked = True
    db.add(row)
    db.flush()
    return (row.user_id, create_refresh_token(db, row.user_id))


def revoke_refresh_token(db: Session, refresh_token: str) -> None:
    token_hash = _hash_token(refresh_token)
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if row is None:
        return
    row.revoked = True
    db.add(row)
    db.flush()


def create_password_reset_token(db: Session, email: str) -> str | None:
    email_digest = hash_email(email)
    account = db.scalar(select(AuthAccount).where(AuthAccount.email_hash == email_digest))
    if account is None:
        return None

    raw_token = f"pr_{secrets.token_urlsafe(48)}"
    row = PasswordResetToken(
        user_id=account.user_id,
        token_hash=_hash_token(raw_token),
        used=False,
        expires_at=datetime.utcnow() + timedelta(minutes=30),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return raw_token


def reset_password_with_token(db: Session, reset_token: str, new_password: str) -> str:
    token_hash = _hash_token(reset_token)
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    if row is None or row.used or row.expires_at <= datetime.utcnow():
        raise ValueError("Invalid reset token")

    account = db.get(AuthAccount, row.user_id)
    if account is None:
        raise ValueError("User not found")

    account.password_hash = hash_password(new_password)
    row.used = True
    db.add(account)
    db.add(row)
    db.flush()
    return account.user_id
