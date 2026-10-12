from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..models import RefreshToken, User
from ..schemas import LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserOut
from ..security import (create_access_token, create_refresh_token, decode_token, hash_password,
                        verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])
s = get_settings()
COOKIE = "docmind_refresh"


def _issue(db: Session, user: User, response: Response) -> TokenOut:
    token, jti, exp = create_refresh_token(user.id)
    db.add(RefreshToken(id=jti, user_id=user.id, expires_at=exp))
    db.commit()
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", secure=s.cookie_secure,
        max_age=s.refresh_token_days * 86400, path="/api/auth",
    )
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return _issue(db, user, response)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return _issue(db, user, response)


@router.post("/refresh", response_model=TokenOut)
def refresh(response: Response, db: Session = Depends(get_db),
            docmind_refresh: str | None = Cookie(default=None)):
    """Rotate the refresh token; reuse of a revoked token revokes the whole family."""
    if not docmind_refresh:
        raise HTTPException(401, "No session")
    try:
        data = decode_token(docmind_refresh, "refresh")
    except jwt.PyJWTError:
        response.delete_cookie(COOKIE, path="/api/auth")
        raise HTTPException(401, "Invalid session")
    row = db.get(RefreshToken, data["jti"])
    if not row or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    if row.revoked:
        db.execute(update(RefreshToken).where(RefreshToken.user_id == row.user_id).values(revoked=True))
        db.commit()
        response.delete_cookie(COOKIE, path="/api/auth")
        raise HTTPException(401, "Session revoked")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(401, "Invalid session")
    row.revoked = True
    return _issue(db, user, response)


@router.post("/logout", status_code=204)
def logout(response: Response, db: Session = Depends(get_db),
           docmind_refresh: str | None = Cookie(default=None)):
    if docmind_refresh:
        try:
            row = db.get(RefreshToken, decode_token(docmind_refresh, "refresh")["jti"])
            if row:
                row.revoked = True
                db.commit()
        except jwt.PyJWTError:
            pass
    response.delete_cookie(COOKIE, path="/api/auth")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = body.name.strip()
    db.commit()
    return user


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True))
    db.commit()
