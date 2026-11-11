from datetime import date

from fastapi import HTTPException

from .database import database
from .schemas import SaveExercise


def assert_editable(cursor, workout_id: int):
    """호출 전에 부모 workouts 행을 FOR UPDATE로 잠가야 합니다."""
    cursor.execute("SELECT status FROM feedback_requests WHERE workout_id=%s", (workout_id,))
    feedback = cursor.fetchone()
    if feedback:
        message = ("피드백 요청을 취소한 후 기록을 수정하세요."
                   if feedback["status"] == "PENDING" else
                   "피드백이 완료된 일지는 수정하거나 삭제할 수 없습니다.")
        raise HTTPException(409, message)


def read_journal(user_id: int, day: date) -> dict:
    with database() as cursor:
        # 이후 세트·피드백 조회까지 같은 일지 상태를 읽습니다.
        cursor.execute("SELECT * FROM workouts WHERE user_id=%s AND workout_date=%s FOR SHARE",
                       (user_id, day))
        workout = cursor.fetchone()
        if not workout:
            return {"workout_date": day, "workout_id": None, "exercises": [], "feedback": None}
        cursor.execute(
            "SELECT we.workout_exercise_id, we.exercise_id, we.exercise_order, "
            "e.name, e.description, e.visibility, e.is_active "
            "FROM workout_exercises we JOIN exercises e ON e.exercise_id=we.exercise_id "
            "WHERE we.workout_id=%s ORDER BY we.exercise_order", (workout["workout_id"],))
        exercises = list(cursor.fetchall())
        for exercise in exercises:
            cursor.execute("SELECT workout_set_id, set_number, weight_kg, reps FROM workout_sets "
                           "WHERE workout_exercise_id=%s ORDER BY set_number",
                           (exercise["workout_exercise_id"],))
            exercise["sets"] = list(cursor.fetchall())
        cursor.execute("SELECT feedback_request_id, request_message, status, reviewer_user_id, "
                       "feedback_content, requested_at, answered_at, updated_at "
                       "FROM feedback_requests WHERE workout_id=%s", (workout["workout_id"],))
        return {**workout, "exercises": exercises, "feedback": cursor.fetchone()}


def save_exercise(user_id: int, day: date, exercise_id: int, body: SaveExercise):
    with database() as cursor:
        # 같은 날짜의 동시 저장은 일지 행 잠금으로 순서대로 처리합니다.
        cursor.execute("INSERT INTO workouts(user_id, workout_date) VALUES (%s,%s) "
                       "ON DUPLICATE KEY UPDATE workout_id=LAST_INSERT_ID(workout_id)", (user_id, day))
        cursor.execute("SELECT workout_id FROM workouts WHERE user_id=%s AND workout_date=%s FOR UPDATE",
                       (user_id, day))
        workout_id = cursor.fetchone()["workout_id"]
        assert_editable(cursor, workout_id)
        cursor.execute("SELECT workout_exercise_id FROM workout_exercises "
                       "WHERE workout_id=%s AND exercise_id=%s", (workout_id, exercise_id))
        existing = cursor.fetchone()
        cursor.execute("SELECT visibility, owner_user_id, is_active FROM exercises "
                       "WHERE exercise_id=%s FOR SHARE", (exercise_id,))
        exercise = cursor.fetchone()
        if not exercise or (exercise["visibility"] == "PRIVATE" and exercise["owner_user_id"] != user_id):
            raise HTTPException(404, "운동을 찾을 수 없습니다.")
        if not existing and not exercise["is_active"]:
            raise HTTPException(409, "사용 중지된 운동을 새로 추가할 수 없습니다.")
        if existing:
            item_id = existing["workout_exercise_id"]
            cursor.execute("DELETE FROM workout_sets WHERE workout_exercise_id=%s", (item_id,))
        else:
            cursor.execute("SELECT COALESCE(MAX(exercise_order),0)+1 AS next_order "
                           "FROM workout_exercises WHERE workout_id=%s", (workout_id,))
            order = cursor.fetchone()["next_order"]
            cursor.execute("INSERT INTO workout_exercises(workout_id,exercise_id,exercise_order) "
                           "VALUES (%s,%s,%s)", (workout_id, exercise_id, order))
            item_id = cursor.lastrowid
        # PUT은 종목의 전체 세트 목록을 교체합니다. 세트 추가 시 기존 목록도 함께 전송합니다.
        cursor.executemany("INSERT INTO workout_sets(workout_exercise_id,set_number,weight_kg,reps) "
                           "VALUES (%s,%s,%s,%s)",
                           [(item_id, n, row.weight_kg, row.reps) for n, row in enumerate(body.sets, 1)])
        cursor.execute("UPDATE workouts SET updated_at=CURRENT_TIMESTAMP WHERE workout_id=%s", (workout_id,))
    return {"workout_id": workout_id, "workout_exercise_id": item_id, "set_count": len(body.sets)}


def delete_exercise(user_id: int, day: date, exercise_id: int):
    with database() as cursor:
        cursor.execute("SELECT workout_id FROM workouts WHERE user_id=%s AND workout_date=%s FOR UPDATE",
                       (user_id, day))
        workout = cursor.fetchone()
        if not workout:
            raise HTTPException(404, "일지를 찾을 수 없습니다.")
        workout_id = workout["workout_id"]
        assert_editable(cursor, workout_id)
        cursor.execute("DELETE FROM workout_exercises WHERE workout_id=%s AND exercise_id=%s",
                       (workout_id, exercise_id))
        if not cursor.rowcount:
            raise HTTPException(404, "일지에 해당 운동이 없습니다.")
        cursor.execute("SELECT COUNT(*) AS count FROM workout_exercises WHERE workout_id=%s", (workout_id,))
        if cursor.fetchone()["count"] == 0:
            cursor.execute("DELETE FROM workouts WHERE workout_id=%s", (workout_id,))
        else:
            cursor.execute("UPDATE workouts SET updated_at=CURRENT_TIMESTAMP WHERE workout_id=%s", (workout_id,))
