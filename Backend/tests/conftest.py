import os
import sys

import mongomock
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Config validates these at import time, so they must exist before `app` loads.
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/test_db")
os.environ.setdefault("ADMIN_EMAILS", "boss@example.com")
os.environ.setdefault("RATELIMIT_AUTH", "1000 per minute")
os.environ.setdefault("RATELIMIT_UPLOAD", "1000 per minute")
os.environ.setdefault("RATELIMIT_CHAT", "1000 per minute")
os.environ.setdefault("RATELIMIT_READ", "1000 per minute")


@pytest.fixture()
def app(monkeypatch):
    import app.extensions as extensions
    from app.main import create_app

    fake_db = mongomock.MongoClient()["test_db"]

    # Swap in an in-memory Mongo instead of touching a real server.
    monkeypatch.setattr(extensions, "init_mongo", lambda _app: None)
    # Tests stub the model out; loading it would add minutes to every run.
    flask_app = create_app(warm_embeddings=False)

    extensions.db = fake_db
    extensions.mongo_connected = True
    flask_app.config["TESTING"] = True

    yield flask_app

    extensions.db = None
    extensions.mongo_connected = False


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def registered(client):
    """Registers a normal user and returns its auth payload."""
    response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "Password123"},
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


@pytest.fixture()
def auth_headers(registered):
    return {"Authorization": f"Bearer {registered['token']}"}


@pytest.fixture()
def admin_headers(client):
    response = client.post(
        "/auth/register",
        json={"name": "Boss", "email": "boss@example.com", "password": "Password123"},
    )
    assert response.status_code == 201, response.get_json()
    data = response.get_json()["data"]
    assert data["user"]["role"] == "admin"
    return {"Authorization": f"Bearer {data['token']}"}
