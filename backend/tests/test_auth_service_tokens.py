from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.models.db_models import AuthAccount
from app.services.auth_service import (
    create_password_reset_token,
    create_refresh_token,
    register_user,
    reset_password_with_token,
    rotate_refresh_token,
)


def _session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return factory()


def test_refresh_token_rotation() -> None:
    db = _session()
    try:
        user = register_user(db, "token-user@example.com", "password123")
        token = create_refresh_token(db, user.id)
        user_id, rotated = rotate_refresh_token(db, token)
        db.commit()

        assert user_id == user.id
        assert rotated != token
    finally:
        db.close()


def test_password_reset_token_flow() -> None:
    db = _session()
    try:
        user = register_user(db, "reset-user@example.com", "password123")
        reset_token = create_password_reset_token(db, "reset-user@example.com")
        assert reset_token is not None

        updated_user_id = reset_password_with_token(db, reset_token, "newpassword123")
        db.commit()

        assert updated_user_id == user.id
        account = db.get(AuthAccount, user.id)
        assert account is not None
        assert account.password_hash
    finally:
        db.close()
