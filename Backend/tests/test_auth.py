import jwt

from app.config import Config


def test_register_returns_a_usable_token(client):
    response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "Ada@Example.com", "password": "Password123"},
    )
    assert response.status_code == 201
    body = response.get_json()

    assert body["success"] is True
    assert body["data"]["user"]["role"] == "user"
    # Email is normalized to lowercase so logins are case-insensitive.
    assert body["data"]["user"]["email"] == "ada@example.com"

    payload = jwt.decode(body["data"]["token"], Config.JWT_SECRET, algorithms=["HS256"])
    assert payload["email"] == "ada@example.com"


def test_password_never_leaves_the_server(client, registered):
    assert "password" not in str(registered).lower()


def test_duplicate_registration_is_rejected(client, registered):
    response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "Password123"},
    )
    assert response.status_code == 409
    assert "already exists" in response.get_json()["message"]


def test_weak_password_lists_every_unmet_rule(client):
    response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "weak@example.com", "password": "abc"},
    )
    assert response.status_code == 400
    body = response.get_json()
    assert len(body["requirements"]) == 3  # length, uppercase, digit
    assert "8 characters" in body["message"]


def test_invalid_email_is_rejected(client):
    response = client.post(
        "/auth/register",
        json={"name": "Ada", "email": "not-an-email", "password": "Password123"},
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_email"


def test_missing_fields_are_named(client):
    response = client.post("/auth/register", json={"email": "a@b.co"})
    assert response.status_code == 400
    assert set(response.get_json()["fields"]) == {"password", "name"}


def test_blank_field_counts_as_missing(client):
    response = client.post(
        "/auth/register",
        json={"name": "   ", "email": "a@b.co", "password": "Password123"},
    )
    assert response.status_code == 400
    assert "name" in response.get_json()["fields"]


def test_login_is_case_insensitive(client, registered):
    response = client.post(
        "/auth/login", json={"email": "ADA@EXAMPLE.COM", "password": "Password123"}
    )
    assert response.status_code == 200
    assert response.get_json()["data"]["user"]["email"] == "ada@example.com"


def test_wrong_password_is_rejected(client, registered):
    response = client.post(
        "/auth/login", json={"email": "ada@example.com", "password": "WrongPass123"}
    )
    assert response.status_code == 401
    assert response.get_json()["message"] == "Invalid email or password"


def test_unknown_email_gives_the_same_message(client):
    """The error must not reveal whether an account exists."""
    response = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "Password123"}
    )
    assert response.status_code == 401
    assert response.get_json()["message"] == "Invalid email or password"


def test_admin_emails_are_promoted(admin_headers):
    # The fixture already asserts the role; this documents the behaviour.
    assert admin_headers["Authorization"].startswith("Bearer ")


def test_me_returns_the_current_profile(client, auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    user = response.get_json()["data"]["user"]
    assert user["email"] == "ada@example.com"
    assert user["documentCount"] == 0
    assert user["queryCount"] == 0


def test_me_requires_a_token(client):
    assert client.get("/auth/me").status_code == 401


def test_malformed_authorization_header_is_rejected(client):
    response = client.get("/auth/me", headers={"Authorization": "some-token"})
    assert response.status_code == 401
    assert "Bearer" in response.get_json()["message"]


def test_garbage_token_is_rejected(client):
    response = client.get("/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401
    assert response.get_json()["code"] == "invalid_token"


def test_expired_token_reports_expiry(client, app):
    from datetime import datetime, timedelta

    expired = jwt.encode(
        {
            "userId": "507f1f77bcf86cd799439011",
            "email": "ada@example.com",
            "role": "user",
            "exp": datetime.utcnow() - timedelta(hours=1),
        },
        Config.JWT_SECRET,
        algorithm="HS256",
    )
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401
    assert response.get_json()["code"] == "token_expired"


def test_token_signed_with_another_secret_is_rejected(client):
    forged = jwt.encode(
        {"userId": "507f1f77bcf86cd799439011", "role": "admin"},
        "attacker-secret",
        algorithm="HS256",
    )
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401
