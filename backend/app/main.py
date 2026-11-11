import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated

import pymysql
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm

from .config import jwt_secret
from .database import database
from .schemas import ExerciseInput, SaveExercise, Signup, TokenOut, UserOut
from .security import CurrentUser, dummy_hash, issue_token, password_hasher, require_user
from .workouts import delete_exercise, read_journal, save_exercise
from .admin import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    jwt_secret()  # 미설정된 토큰 비밀키로 서버를 실행하지 않습니다.
    yield


app = FastAPI(title="운동 기록 API", version="0.1.0", lifespan=lifespan)
app.include_router(admin_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(pymysql.MySQLError)
async def database_error(request, exc):
    # 원본 DB 오류에는 SQL이나 비밀번호 해시 등이 포함될 수 있어 응답에 노출하지 않습니다.
    code = exc.args[0] if exc.args else None
    if code in (1205, 1213):
        return JSONResponse(status_code=409, content={"detail": "동시에 기록이 변경되었습니다. 다시 조회한 뒤 저장하세요."})
    if isinstance(exc, pymysql.IntegrityError):
        return JSONResponse(status_code=409, content={"detail": "중복되거나 연결된 데이터가 있어 처리할 수 없습니다."})
    return JSONResponse(status_code=503, content={"detail": "DB 연결 또는 쿼리 실행에 실패했습니다. .env와 fitness_log 테이블을 확인하세요."})


@app.get("/health", tags=["상태"])
def health():
    return {"status": "ok"}


@app.get("/health/db", tags=["상태"])
def health_db():
    expected = {"users", "exercises", "workouts", "workout_exercises", "workout_sets", "feedback_requests"}
    with database() as cursor:
        cursor.execute("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()")
        present = {row["name"] for row in cursor.fetchall()}
    if expected - present:
        raise HTTPException(503, "필수 테이블이 없습니다. fitness_schema.sql 실행 결과를 확인하세요.")
    return {"status": "ok", "tables": sorted(expected)}


@app.post("/auth/register", response_model=UserOut, status_code=201, tags=["계정"])
def register(body: Signup):
    hashed = password_hasher.hash(body.password)
    try:
        with database() as cursor:
            cursor.execute("INSERT INTO users(login_id,password_hash,role) VALUES (%s,%s,'USER')",
                           (body.login_id, hashed))
            user_id = cursor.lastrowid
    except pymysql.IntegrityError as exc:
        if exc.args[0] == 1062:
            raise HTTPException(409, "이미 사용 중인 아이디입니다.") from None
        raise
    return {"user_id": user_id, "login_id": body.login_id, "role": "USER"}


@app.post("/auth/login", response_model=TokenOut, tags=["계정"])
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()]):
    if len(form.username) > 50 or len(form.password) > 128:
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")
    with database() as cursor:
        cursor.execute("SELECT user_id, password_hash FROM users WHERE login_id=%s", (form.username,))
        user = cursor.fetchone()
    valid = password_hasher.verify(form.password, user["password_hash"] if user else dummy_hash)
    if not user or not valid:
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.",
                            headers={"WWW-Authenticate": "Bearer"})
    return {"access_token": issue_token(user["user_id"]), "token_type": "bearer"}


@app.get("/auth/me", response_model=UserOut, tags=["계정"])
def me(user: CurrentUser):
    return user


@app.get("/exercises", tags=["운동 종목"])
def exercises(user: CurrentUser, q: str = Query(default="", max_length=100), active_only: bool = True):
    with database() as cursor:
        # ADMIN의 관리 목록에는 공용 운동만, USER에게는 공용 + 본인 개인 운동만 표시합니다.
        cursor.execute(
            "SELECT exercise_id,name,description,visibility,is_active FROM exercises "
            "WHERE (visibility='PUBLIC' OR owner_user_id=%s) "
            "AND (%s=0 OR is_active=1) AND name LIKE %s ORDER BY name,exercise_id",
            (user["user_id"] if user["role"] == "USER" else None, active_only, f"%{q}%"))
        return cursor.fetchall()


@app.post("/exercises", status_code=201, tags=["운동 종목"])
def create_exercise(body: ExerciseInput, user: CurrentUser):
    public = user["role"] == "ADMIN"
    with database() as cursor:
        cursor.execute("INSERT INTO exercises(name,description,visibility,owner_user_id) VALUES (%s,%s,%s,%s)",
                       (body.name, body.description, "PUBLIC" if public else "PRIVATE", None if public else user["user_id"]))
        exercise_id = cursor.lastrowid
    return {"exercise_id": exercise_id, "name": body.name, "visibility": "PUBLIC" if public else "PRIVATE"}


@app.get("/workouts/calendar", tags=["운동 일지"])
def calendar(user: CurrentUser, start: date, end: date):
    require_user(user)
    if end < start or (end - start).days > 366:
        raise HTTPException(422, "날짜 범위는 시작일부터 최대 366일 이내로 입력하세요.")
    with database() as cursor:
        cursor.execute("SELECT w.workout_date FROM workouts w WHERE w.user_id=%s "
                       "AND w.workout_date BETWEEN %s AND %s AND EXISTS "
                       "(SELECT 1 FROM workout_exercises we JOIN workout_sets ws "
                       "ON ws.workout_exercise_id=we.workout_exercise_id WHERE we.workout_id=w.workout_id) "
                       "ORDER BY w.workout_date", (user["user_id"], start, end))
        return {"dates": [row["workout_date"] for row in cursor.fetchall()]}


@app.get("/workouts/{day}", tags=["운동 일지"])
def journal(day: date, user: CurrentUser):
    require_user(user)
    return read_journal(user["user_id"], day)


@app.put("/workouts/{day}/exercises/{exercise_id}", tags=["운동 일지"])
def put_exercise(day: date, exercise_id: int, body: SaveExercise, user: CurrentUser):
    """종목별 전체 세트를 저장합니다. 같은 날짜·종목이면 기존 세트 목록을 교체합니다."""
    require_user(user)
    return save_exercise(user["user_id"], day, exercise_id, body)


@app.delete("/workouts/{day}/exercises/{exercise_id}", status_code=204, tags=["운동 일지"])
def remove_exercise(day: date, exercise_id: int, user: CurrentUser):
    require_user(user)
    delete_exercise(user["user_id"], day, exercise_id)
    return Response(status_code=204)
