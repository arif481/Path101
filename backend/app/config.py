from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "10080"))
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "change-me-admin-key")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
