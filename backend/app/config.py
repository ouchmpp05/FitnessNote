import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@lru_cache
def jwt_secret() -> str:
    value = os.getenv("JWT_SECRET", "")
    if len(value) < 32 or value.startswith("replace-with-"):
        raise RuntimeError("backend/.env의 JWT_SECRET을 임의의 32자 이상 값으로 설정하세요.")
    return value
