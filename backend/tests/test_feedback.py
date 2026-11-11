import pytest
from fastapi.testclient import TestClient

from app.config import jwt_secret
from app.main import app
from app.security import current_user


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-only-key-0123456789-abcdefghijklmnopqrstuvwxyz")
    jwt_secret.cache_clear()
    yield
    app.dependency_overrides.clear()
    jwt_secret.cache_clear()


@pytest.mark.parametrize("path", ["/admin/users", "/admin/users/1/workouts",
                                  "/admin/users/1/workouts/2026-11-11",
                                  "/admin/users/1/statistics?start=2026-11-01&end=2026-11-11",
                                  "/admin/feedback", "/admin/feedback/1"])
def test_regular_user_cannot_read_admin_data(path):
    app.dependency_overrides[current_user] = lambda: {"user_id": 1, "role": "USER"}
    with TestClient(app) as client:
        assert client.get(path).status_code == 403


def test_regular_user_cannot_answer():
    app.dependency_overrides[current_user] = lambda: {"user_id": 1, "role": "USER"}
    with TestClient(app) as client:
        assert client.put("/admin/feedback/1/answer", json={"feedback_content": "answer"}).status_code == 403


@pytest.mark.parametrize("content", ["", "   ", "\n\t", "　"])
def test_whitespace_answers_rejected(content):
    app.dependency_overrides[current_user] = lambda: {"user_id": 2, "role": "ADMIN"}
    with TestClient(app) as client:
        assert client.put("/admin/feedback/1/answer", json={"feedback_content": content}).status_code == 422


def test_admin_cannot_request_or_cancel_user_feedback():
    app.dependency_overrides[current_user] = lambda: {"user_id": 2, "role": "ADMIN"}
    with TestClient(app) as client:
        assert client.post("/workouts/2026-11-11/feedback", json={}).status_code == 403
        assert client.delete("/workouts/2026-11-11/feedback").status_code == 403
