from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import jwt_secret
from app.main import app
from app.schemas import SaveExercise
from app.security import current_user, issue_token, password_hasher, token_user_id
from app import workouts


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-key-0123456789-abcdefghijklmnopqrstuvwxyz")
    jwt_secret.cache_clear()
    yield
    app.dependency_overrides.clear()
    jwt_secret.cache_clear()


def test_password_is_hashed_and_verified():
    hashed = password_hasher.hash("password123")
    assert hashed != "password123"
    assert password_hasher.verify("password123", hashed)
    assert not password_hasher.verify("incorrect", hashed)


def test_jwt_requires_valid_signature_and_expiry():
    assert token_user_id(issue_token(42)) == 42
    expired = jwt.encode({"sub": "42", "iat": datetime.now(timezone.utc) - timedelta(hours=2),
                          "exp": datetime.now(timezone.utc) - timedelta(hours=1)}, jwt_secret(), algorithm="HS256")
    wrong_signature = jwt.encode({"sub": "42", "iat": datetime.now(timezone.utc),
                                  "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                                 "different-secret-key-that-is-over-thirty-two-characters", algorithm="HS256")
    for token in (expired, wrong_signature, "not-a-token"):
        with pytest.raises(HTTPException) as exc:
            token_user_id(token)
        assert exc.value.status_code == 401


def test_health_and_protected_route():
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/workouts/2026-11-11").status_code == 401
        assert client.get("/openapi.json").status_code == 200


def test_signup_cannot_choose_admin_role():
    with TestClient(app) as client:
        result = client.post("/auth/register", json={"login_id": "tester", "password": "password123", "role": "ADMIN"})
        assert result.status_code == 422


def test_admin_cannot_write_user_records():
    app.dependency_overrides[current_user] = lambda: {"user_id": 2, "login_id": "admin", "role": "ADMIN"}
    with TestClient(app) as client:
        result = client.put("/workouts/2026-11-11/exercises/1", json={"sets": [{"weight_kg": 50, "reps": 10}]})
        assert result.status_code == 403
        assert client.delete("/workouts/2026-11-11/exercises/1").status_code == 403


@pytest.mark.parametrize("sets", [[], [{"weight_kg": -1, "reps": 10}],
                                    [{"weight_kg": 1, "reps": 0}],
                                    [{"weight_kg": "1.001", "reps": 10}],
                                    [{"weight_kg": 20, "reps": 1.5}]])
def test_invalid_sets_rejected(sets):
    app.dependency_overrides[current_user] = lambda: {"user_id": 1, "role": "USER"}
    with TestClient(app) as client:
        assert client.put("/workouts/2026-11-11/exercises/1", json={"sets": sets}).status_code == 422


class FakeCursor:
    def __init__(self, rows):
        self.rows = iter(rows)
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append(sql)

    def fetchone(self):
        return next(self.rows)


@pytest.mark.parametrize("status", ["PENDING", "COMPLETED"])
def test_feedback_lock_blocks_set_replacement(monkeypatch, status):
    cursor = FakeCursor([{"workout_id": 1}, {"status": status}])

    @contextmanager
    def fake_database():
        yield cursor

    monkeypatch.setattr(workouts, "database", fake_database)
    with pytest.raises(HTTPException) as exc:
        workouts.save_exercise(1, date(2026, 11, 11), 1,
                               SaveExercise(sets=[{"weight_kg": 50, "reps": 10}]))
    assert exc.value.status_code == 409
    assert not any("DELETE FROM workout_sets" in sql for sql in cursor.statements)


def test_other_users_private_exercise_not_accessible(monkeypatch):
    cursor = FakeCursor([{"workout_id": 1}, None, None,
                         {"visibility": "PRIVATE", "owner_user_id": 999, "is_active": 1}])

    @contextmanager
    def fake_database():
        yield cursor

    monkeypatch.setattr(workouts, "database", fake_database)
    with pytest.raises(HTTPException) as exc:
        workouts.save_exercise(1, date(2026, 11, 11), 1,
                               SaveExercise(sets=[{"weight_kg": 50, "reps": 10}]))
    assert exc.value.status_code == 404
    assert not any("INSERT INTO workout_exercises" in sql for sql in cursor.statements)
