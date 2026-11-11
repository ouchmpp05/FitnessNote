"""명시적으로 환경 파일을 지정했을 때만 실행하는 MySQL 통합 검증.

테스트 계정·운동·요청은 커밋하지 않고 끝에 전체 롤백합니다. 기존 행은 수정하지 않습니다.
"""
import os
import uuid
from contextlib import contextmanager
from datetime import date
from importlib import import_module

import pymysql
import pytest
from dotenv import dotenv_values
from fastapi.testclient import TestClient

from app.config import jwt_secret
from app.main import app
from app.security import current_user


@pytest.mark.skipif(not os.getenv("FITNESS_MYSQL_ENV_FILE"), reason="MySQL 통합 테스트 환경을 명시하지 않았습니다.")
def test_feedback_full_lifecycle_mysql(monkeypatch):
    config = dotenv_values(os.environ["FITNESS_MYSQL_ENV_FILE"])
    connection = pymysql.connect(host=config.get("DB_HOST", "127.0.0.1"),
                                 port=int(config.get("DB_PORT", 3306)), user=config.get("DB_USER", "root"),
                                 password=config.get("DB_PASSWORD", ""), database=config.get("DB_NAME", "fitness_log"),
                                 charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, autocommit=False,
                                 init_command="SET time_zone = '+09:00'", connect_timeout=5)
    monkeypatch.setenv("JWT_SECRET", "mysql-test-key-0123456789-abcdefghijklmnopqrstuvwxyz")
    jwt_secret.cache_clear()
    label = "qa_" + uuid.uuid4().hex[:12]
    actors = []
    try:
        with connection.cursor() as cursor:
            for i, role in enumerate(["USER", "USER", "ADMIN", "ADMIN"]):
                cursor.execute("INSERT INTO users(login_id,password_hash,role) VALUES (%s,%s,%s)",
                               (f"{label}_{i}", "unused-test-hash", role))
                actors.append({"user_id": cursor.lastrowid, "login_id": f"{label}_{i}", "role": role})
            owner, stranger, first_admin, other_admin = actors
            cursor.execute("INSERT INTO exercises(name,visibility,owner_user_id) VALUES (%s,'PRIVATE',%s)", (label, owner["user_id"]))
            exercise_id = cursor.lastrowid

        @contextmanager
        def isolated_request():
            with connection.cursor() as cursor:
                cursor.execute("SAVEPOINT api_request")
                try:
                    yield cursor
                    cursor.execute("RELEASE SAVEPOINT api_request")
                except Exception:
                    cursor.execute("ROLLBACK TO SAVEPOINT api_request")
                    cursor.execute("RELEASE SAVEPOINT api_request")
                    raise

        for module in ("app.main", "app.admin", "app.workouts"):
            monkeypatch.setattr(import_module(module), "database", isolated_request)

        def act(actor):
            app.dependency_overrides[current_user] = lambda: actor

        with TestClient(app) as client:
            act(owner)
            path = f"/workouts/2000-01-02/exercises/{exercise_id}"
            sets = {"sets": [{"weight_kg": 50, "reps": 10}, {"weight_kg": 45, "reps": 12}]}
            assert client.put(path, json=sets).status_code == 200
            assert client.post("/workouts/2000-01-03/feedback", json={}).status_code == 404
            result = client.post("/workouts/2000-01-02/feedback", json={"request_message": "지난 기록과 비교해 주세요"})
            assert result.status_code == 201, result.text
            old_request = result.json()["feedback_request_id"]
            assert client.post("/workouts/2000-01-02/feedback", json={}).status_code == 409
            assert client.put(path, json=sets).status_code == 409
            assert client.delete(path).status_code == 409
            act(stranger)
            assert client.delete("/workouts/2000-01-02/feedback").status_code == 404
            assert client.get(f"/admin/feedback/{old_request}").status_code == 403
            act(owner)
            assert client.delete("/workouts/2000-01-02/feedback").status_code == 204
            assert client.put(path, json=sets).status_code == 200
            result = client.post("/workouts/2000-01-02/feedback", json={})
            request_id = result.json()["feedback_request_id"]
            act(first_admin)
            assert client.get(f"/admin/feedback/{old_request}").status_code == 404
            queue = client.get("/admin/feedback?status=PENDING").json()
            assert queue["total"] >= 1
            member_records = client.get(f'/admin/users/{owner["user_id"]}/workouts').json()
            assert member_records["items"][0]["workout_date"] == '2000-01-02'
            journal = client.get(f'/admin/users/{owner["user_id"]}/workouts/2000-01-02').json()
            assert journal["exercises"][0]["name"] == label
            stats = client.get(f'/admin/users/{owner["user_id"]}/statistics?start=2000-01-01&end=2000-01-03')
            assert stats.status_code == 200, stats.text
            assert float(stats.json()[0]["max"]) == 50 and int(stats.json()[0]["reps"]) == 22
            answer_path = f"/admin/feedback/{request_id}/answer"
            assert client.put(answer_path, json={"feedback_content": "첫 답변"}).status_code == 200
            first = client.get(f"/admin/feedback/{request_id}").json()
            assert client.put(answer_path, json={"feedback_content": "수정한 답변"}).status_code == 200
            edited = client.get(f"/admin/feedback/{request_id}").json()
            assert edited["answered_at"] == first["answered_at"]
            act(other_admin)
            assert client.put(answer_path, json={"feedback_content": "다른 관리자"}).status_code == 403
            act(owner)
            assert client.delete("/workouts/2000-01-02/feedback").status_code == 409
            assert client.put(path, json=sets).status_code == 409
            assert client.delete(path).status_code == 409
            result = client.get("/workouts/2000-01-02").json()
            assert result["feedback"]["feedback_content"] == "수정한 답변"
    finally:
        app.dependency_overrides.clear()
        jwt_secret.cache_clear()
        connection.rollback()
        connection.close()
