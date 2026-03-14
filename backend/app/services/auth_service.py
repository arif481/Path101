from __future__ import annotations

import secrets
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.db_models import AuthAccount, User
from app.security import hash_email, hash_password, verify_password


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
        password_hash=hash_password(password),
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
    return user
