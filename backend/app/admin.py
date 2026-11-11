"""관리자 조회와 일지별 피드백. 기록 변경과 같은 부모 일지 잠금을 사용합니다."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from .database import database
from .security import AdminUser, CurrentUser, require_user
from .workouts import read_journal

router = APIRouter()


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    request_message: str | None = Field(default=None, max_length=5000)


class FeedbackAnswer(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    feedback_content: str = Field(min_length=1, max_length=10000)


def checked_user(cursor, user_id: int):
    cursor.execute("SELECT user_id,login_id,created_at FROM users WHERE user_id=%s AND role='USER'", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")
    return user


def owned_workout(cursor, user_id: int, day: date):
    cursor.execute("SELECT workout_id FROM workouts WHERE user_id=%s AND workout_date=%s FOR UPDATE", (user_id, day))
    workout = cursor.fetchone()
    if not workout:
        raise HTTPException(404, "먼저 운동 기록을 저장해 주세요.")
    return workout["workout_id"]


@router.post("/workouts/{day}/feedback", status_code=201, tags=["피드백"])
def request_feedback(day: date, body: FeedbackRequest, user: CurrentUser):
    require_user(user)
    with database() as cursor:
        workout_id = owned_workout(cursor, user["user_id"], day)
        cursor.execute("SELECT status FROM feedback_requests WHERE workout_id=%s FOR UPDATE", (workout_id,))
        if cursor.fetchone():
            raise HTTPException(409, "이미 피드백을 요청했거나 답변이 완료된 일지입니다.")
        cursor.execute("SELECT 1 FROM workout_exercises we JOIN workout_sets ws "
                       "ON ws.workout_exercise_id=we.workout_exercise_id WHERE we.workout_id=%s LIMIT 1", (workout_id,))
        if not cursor.fetchone():
            raise HTTPException(409, "세트 기록이 있는 일지만 피드백을 요청할 수 있습니다.")
        cursor.execute("INSERT INTO feedback_requests(workout_id,request_message) VALUES (%s,%s)",
                       (workout_id, body.request_message or None))
        request_id = cursor.lastrowid
    return {"feedback_request_id": request_id, "status": "PENDING"}


@router.delete("/workouts/{day}/feedback", status_code=204, tags=["피드백"])
def cancel_feedback(day: date, user: CurrentUser):
    require_user(user)
    with database() as cursor:
        workout_id = owned_workout(cursor, user["user_id"], day)
        cursor.execute("SELECT status FROM feedback_requests WHERE workout_id=%s FOR UPDATE", (workout_id,))
        request = cursor.fetchone()
        if not request:
            raise HTTPException(404, "취소할 피드백 요청이 없습니다.")
        if request["status"] != "PENDING":
            raise HTTPException(409, "답변이 완료된 요청은 취소할 수 없습니다.")
        cursor.execute("DELETE FROM feedback_requests WHERE workout_id=%s AND status='PENDING'", (workout_id,))
    return Response(status_code=204)


@router.get("/admin/users", tags=["관리자"])
def users(admin: AdminUser, q: str = Query(default="", max_length=50),
          limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    with database() as cursor:
        cursor.execute("SELECT COUNT(*) AS total FROM users WHERE role='USER' AND login_id LIKE %s", (f"%{q}%",))
        total = cursor.fetchone()["total"]
        cursor.execute("SELECT u.user_id,u.login_id,u.created_at, "
                       "(SELECT COUNT(*) FROM workouts w WHERE w.user_id=u.user_id) AS workout_count "
                       "FROM users u WHERE u.role='USER' AND u.login_id LIKE %s "
                       "ORDER BY u.user_id DESC LIMIT %s OFFSET %s", (f"%{q}%", limit, offset))
        return {"items": cursor.fetchall(), "total": total}


@router.get("/admin/users/{user_id}/workouts", tags=["관리자"])
def user_workouts(user_id: int, admin: AdminUser, limit: int = Query(default=25, ge=1, le=100),
                  offset: int = Query(default=0, ge=0)):
    with database() as cursor:
        user = checked_user(cursor, user_id)
        cursor.execute("SELECT COUNT(*) AS total FROM workouts WHERE user_id=%s", (user_id,))
        total = cursor.fetchone()["total"]
        cursor.execute("SELECT w.workout_id,w.workout_date, "
                       "(SELECT COUNT(*) FROM workout_exercises we WHERE we.workout_id=w.workout_id) AS exercise_count, "
                       "f.status AS feedback_status FROM workouts w LEFT JOIN feedback_requests f "
                       "ON f.workout_id=w.workout_id WHERE w.user_id=%s ORDER BY w.workout_date DESC LIMIT %s OFFSET %s",
                       (user_id, limit, offset))
        return {"user": user, "items": cursor.fetchall(), "total": total}


@router.get("/admin/users/{user_id}/workouts/{day}", tags=["관리자"])
def user_journal(user_id: int, day: date, admin: AdminUser):
    with database() as cursor:
        checked_user(cursor, user_id)
    return read_journal(user_id, day)


@router.get("/admin/users/{user_id}/statistics", tags=["관리자"])
def user_statistics(user_id: int, start: date, end: date, admin: AdminUser):
    if end < start or (end - start).days > 366:
        raise HTTPException(422, "시작일과 종료일은 366일 이내로 지정하세요.")
    with database() as cursor:
        checked_user(cursor, user_id)
        cursor.execute("SELECT w.workout_date AS day,e.exercise_id,e.name,e.visibility, "
                       "MAX(ws.weight_kg) AS max,SUM(ws.reps) AS reps "
                       "FROM workouts w JOIN workout_exercises we ON we.workout_id=w.workout_id "
                       "JOIN exercises e ON e.exercise_id=we.exercise_id "
                       "JOIN workout_sets ws ON ws.workout_exercise_id=we.workout_exercise_id "
                       "WHERE w.user_id=%s AND w.workout_date BETWEEN %s AND %s "
                       "GROUP BY w.workout_date,e.exercise_id,e.name,e.visibility ORDER BY w.workout_date,e.exercise_id",
                       (user_id, start, end))
        return cursor.fetchall()


FEEDBACK_COLUMNS = ("f.feedback_request_id,f.workout_id,f.request_message,f.status,f.reviewer_user_id,"
                    "f.feedback_content,f.requested_at,f.answered_at,f.updated_at,w.workout_date,"
                    "u.user_id,u.login_id")
FEEDBACK_FROM = (" FROM feedback_requests f JOIN workouts w ON w.workout_id=f.workout_id "
                 "JOIN users u ON u.user_id=w.user_id ")


@router.get("/admin/feedback", tags=["관리자"])
def feedback_list(admin: AdminUser, status: Literal["PENDING", "COMPLETED"] = "PENDING",
                  limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    with database() as cursor:
        cursor.execute("SELECT COUNT(*) AS total" + FEEDBACK_FROM + "WHERE f.status=%s", (status,))
        total = cursor.fetchone()["total"]
        cursor.execute("SELECT " + FEEDBACK_COLUMNS + FEEDBACK_FROM +
                       "WHERE f.status=%s ORDER BY f.requested_at DESC,f.feedback_request_id DESC LIMIT %s OFFSET %s",
                       (status, limit, offset))
        return {"items": cursor.fetchall(), "total": total}


@router.get("/admin/feedback/{request_id}", tags=["관리자"])
def feedback_detail(request_id: int, admin: AdminUser):
    with database() as cursor:
        cursor.execute("SELECT " + FEEDBACK_COLUMNS + FEEDBACK_FROM + "WHERE f.feedback_request_id=%s", (request_id,))
        request = cursor.fetchone()
        if not request:
            raise HTTPException(404, "요청이 취소되었거나 존재하지 않습니다.")
        return request


@router.put("/admin/feedback/{request_id}/answer", tags=["관리자"])
def answer_feedback(request_id: int, body: FeedbackAnswer, admin: AdminUser):
    with database() as cursor:
        cursor.execute("SELECT workout_id FROM feedback_requests WHERE feedback_request_id=%s", (request_id,))
        found = cursor.fetchone()
        if not found:
            raise HTTPException(404, "요청이 취소되었거나 존재하지 않습니다.")
        # 기록 편집·취소와 동일하게 일지 → 요청 순서로 잠급니다.
        cursor.execute("SELECT workout_id FROM workouts WHERE workout_id=%s FOR UPDATE", (found["workout_id"],))
        if not cursor.fetchone():
            raise HTTPException(404, "일지를 찾을 수 없습니다.")
        cursor.execute("SELECT status,reviewer_user_id FROM feedback_requests WHERE feedback_request_id=%s FOR UPDATE", (request_id,))
        request = cursor.fetchone()
        if not request:
            raise HTTPException(404, "요청이 취소되었습니다. 목록을 다시 확인하세요.")
        if request["status"] == "COMPLETED":
            if request["reviewer_user_id"] != admin["user_id"]:
                raise HTTPException(403, "최초 답변을 작성한 관리자만 수정할 수 있습니다.")
            cursor.execute("UPDATE feedback_requests SET feedback_content=%s,updated_at=CURRENT_TIMESTAMP "
                           "WHERE feedback_request_id=%s", (body.feedback_content, request_id))
        else:
            cursor.execute("UPDATE feedback_requests SET status='COMPLETED',reviewer_user_id=%s,"
                           "feedback_content=%s,answered_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP "
                           "WHERE feedback_request_id=%s", (admin["user_id"], body.feedback_content, request_id))
    return {"feedback_request_id": request_id, "status": "COMPLETED"}
