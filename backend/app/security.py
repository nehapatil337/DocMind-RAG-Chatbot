import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

s = get_settings()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


def _encode(payload: dict, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({**payload, "iat": now, "exp": now + ttl}, s.jwt_secret, s.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    return _encode({"sub": user_id, "typ": "access"}, timedelta(minutes=s.access_token_minutes))


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    jti = str(uuid.uuid4())
    ttl = timedelta(days=s.refresh_token_days)
    return _encode({"sub": user_id, "typ": "refresh", "jti": jti}, ttl), jti, datetime.now(timezone.utc) + ttl


def decode_token(token: str, expected_type: str) -> dict:
    """Raises jwt.PyJWTError on any problem."""
    data = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    if data.get("typ") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return data
