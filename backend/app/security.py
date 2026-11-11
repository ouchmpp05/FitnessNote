import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash

from .config import jwt_secret
from .database import database

password_hasher = PasswordHash.recommended()
oauth2 = OAuth2PasswordBearer(tokenUrl="auth/login")
# 없는 아이디도 해시 검증을 수행해 로그인 실패 처리 시간을 비슷하게 유지합니다.
dummy_hash = password_hasher.hash("unused-dummy-password")


def issue_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "iat": now,
         "exp": now + timedelta(minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "60")))},
        jwt_secret(), algorithm="HS256",
    )


def token_user_id(token: str) -> int:
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=["HS256"],
                             options={"require": ["sub", "iat", "exp"]})
        user_id = int(payload["sub"])
        if user_id < 1:
            raise ValueError
        return user_id
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "로그인이 필요하거나 토큰이 만료되었습니다.",
                            headers={"WWW-Authenticate": "Bearer"}) from None


def current_user(token: Annotated[str, Depends(oauth2)]) -> dict:
    user_id = token_user_id(token)
    with database() as cursor:
        cursor.execute("SELECT user_id, login_id, role FROM users WHERE user_id=%s", (user_id,))
        user = cursor.fetchone()
    if not user:
        raise HTTPException(401, "존재하지 않는 계정입니다.")
    return user


CurrentUser = Annotated[dict, Depends(current_user)]


def require_user(user: dict):
    if user["role"] != "USER":
        raise HTTPException(403, "관리자는 사용자 운동 기록을 변경할 수 없습니다.")


def admin_user(user: CurrentUser) -> dict:
    if user["role"] != "ADMIN":
        raise HTTPException(403, "관리자만 사용할 수 있습니다.")
    return user


AdminUser = Annotated[dict, Depends(admin_user)]
