"""
VERIDACT — Authentication Tests

Covers registration, login, duplicate-email handling, and JWT verification.
"""
from jose import jwt

from app import config
from app.models import User
from app.services import auth_service

TEST_PASSWORD = "demo1234"


def _register_payload(**overrides):
    payload = {
        "email": "newcitizen@veridact.com",
        "password": TEST_PASSWORD,
        "name": "New Citizen",
        "organization": "Veridact Labs",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def test_register_creates_citizen_account(client):
    # Arrange
    payload = _register_payload()

    # Act
    response = client.post("/api/auth/register", json=payload)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == payload["email"]
    assert body["name"] == payload["name"]
    assert body["role"] == "citizen"
    assert body["is_active"] is True
    assert "password_hash" not in body


def test_registered_user_can_log_in(client):
    # Arrange
    payload = _register_payload()
    client.post("/api/auth/register", json=payload)

    # Act
    response = client.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == payload["email"]


def test_register_rejects_duplicate_email(client):
    # Arrange — first registration must succeed
    payload = _register_payload()
    assert client.post("/api/auth/register", json=payload).status_code == 201

    # Act
    response = client.post("/api/auth/register", json=payload)

    # Assert
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_register_rejects_short_password(client):
    # Arrange
    payload = _register_payload(password="short")

    # Act
    response = client.post("/api/auth/register", json=payload)

    # Assert
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_login_with_valid_credentials_returns_token(client, users):
    # Act
    response = client.post(
        "/api/auth/login",
        json={"email": users["citizen1"].email, "password": TEST_PASSWORD},
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["id"] == users["citizen1"].id
    assert body["user"]["role"] == "citizen"


def test_login_with_wrong_password_returns_401(client, users):
    # Act
    response = client.post(
        "/api/auth/login",
        json={"email": users["admin"].email, "password": "definitely-wrong"},
    )

    # Assert
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_login_with_unknown_email_returns_401(client):
    # Act
    response = client.post(
        "/api/auth/login",
        json={"email": "ghost@veridact.com", "password": TEST_PASSWORD},
    )

    # Assert
    assert response.status_code == 401


def test_inactive_user_cannot_log_in(client, db_session):
    # Arrange
    db_session.add(
        User(
            email="disabled@veridact.com",
            password_hash=auth_service.get_password_hash(TEST_PASSWORD),
            name="Disabled User",
            role="citizen",
            is_active=False,
        )
    )
    db_session.commit()

    # Act
    response = client.post(
        "/api/auth/login",
        json={"email": "disabled@veridact.com", "password": TEST_PASSWORD},
    )

    # Assert
    assert response.status_code == 403
    assert response.json()["detail"] == "Inactive user"


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

def test_me_returns_current_users_profile(client, users, citizen_headers):
    # Act
    response = client.get("/api/auth/me", headers=citizen_headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == users["citizen1"].id
    assert body["email"] == users["citizen1"].email


def test_me_without_token_is_rejected(client):
    # Act
    response = client.get("/api/auth/me")

    # Assert — HTTPBearer reports missing credentials as 403; some versions use 401
    assert response.status_code in (401, 403)


def test_me_with_invalid_token_is_rejected(client):
    # Act
    response = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-valid-jwt"}
    )

    # Assert
    assert response.status_code == 401


def test_access_token_carries_user_subject_and_expiry(users):
    # Arrange
    token = users["inv1"].token

    # Act
    payload = jwt.decode(
        token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM]
    )

    # Assert
    assert payload["sub"] == users["inv1"].id
    assert "exp" in payload
