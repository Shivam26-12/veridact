"""
VERIDACT — Admin Endpoint Tests

Verifies RBAC on /api/admin/users, /api/admin/analytics and /api/admin/custody,
plus the correctness of the analytics aggregates and user administration.
"""
from datetime import datetime, timedelta

import pytest

from app.constants import INCIDENT_TYPES, SEVERITY_LEVELS
from app.models import User


# ---------------------------------------------------------------------------
# GET /api/admin/users
# ---------------------------------------------------------------------------

def test_super_admin_lists_every_user(client, users, admin_headers):
    # Act
    response = client.get("/api/admin/users", headers=admin_headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == len(users)
    assert len(body["items"]) == len(users)
    assert {item["email"] for item in body["items"]} == {
        account.email for account in users.values()
    }
    assert all("password_hash" not in item for item in body["items"])


@pytest.mark.parametrize(
    "headers_fixture", ["supervisor_headers", "investigator_headers", "citizen_headers"]
)
def test_user_list_is_super_admin_only(client, request, headers_fixture):
    # Arrange
    headers = request.getfixturevalue(headers_fixture)

    # Act
    response = client.get("/api/admin/users", headers=headers)

    # Assert
    assert response.status_code == 403


def test_super_admin_can_change_role_and_deactivate_user(
    client, users, admin_headers, db_session
):
    # Arrange
    target = users["citizen2"]

    # Act
    response = client.patch(
        f"/api/admin/users/{target.id}",
        json={"role": "investigator", "is_active": False},
        headers=admin_headers,
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "investigator"
    assert body["is_active"] is False

    db_session.expire_all()
    stored = db_session.query(User).filter(User.id == target.id).one()
    assert stored.role == "investigator"
    assert stored.is_active is False


def test_update_missing_user_returns_404(client, admin_headers):
    # Act
    response = client.patch(
        "/api/admin/users/00000000-0000-0000-0000-000000000000",
        json={"role": "citizen"},
        headers=admin_headers,
    )

    # Assert
    assert response.status_code == 404


def test_deactivated_user_is_locked_out(client, users, admin_headers):
    # Arrange — deactivate first, then reuse the existing token
    client.patch(
        f"/api/admin/users/{users['citizen1'].id}",
        json={"is_active": False},
        headers=admin_headers,
    )

    # Act
    me_response = client.get("/api/auth/me", headers=users["citizen1"].headers)
    login_response = client.post(
        "/api/auth/login",
        json={"email": users["citizen1"].email, "password": "demo1234"},
    )

    # Assert
    assert me_response.status_code == 403
    assert login_response.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/admin/analytics
# ---------------------------------------------------------------------------

def test_analytics_computes_real_aggregates(client, case_factory, admin_headers):
    # Arrange
    case_factory(severity="critical", incident_type="phishing", status="open")
    case_factory(severity="high", incident_type="ransomware", status="in_progress")
    case_factory(severity="low", incident_type="phishing", status="resolved")

    # Act
    response = client.get("/api/admin/analytics", headers=admin_headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total_incidents"] == 3
    assert body["open_cases"] == 1
    assert body["resolved_cases"] == 1
    assert body["critical_count"] == 1
    assert body["incidents_by_severity"] == {
        "low": 1,
        "medium": 0,
        "high": 1,
        "critical": 1,
    }
    assert set(body["incidents_by_severity"]) == set(SEVERITY_LEVELS)
    assert set(body["incidents_by_type"]) == set(INCIDENT_TYPES)
    assert body["incidents_by_type"]["phishing"] == 2
    assert body["incidents_by_type"]["ransomware"] == 1
    assert len(body["recent_incidents"]) == 3
    assert body["recent_incidents"][0]["case_number"].startswith("INC-")
    assert "assigned_to" in body["recent_incidents"][0]


def test_analytics_measures_average_resolution_time(
    client, case_factory, admin_headers, db_session
):
    # Arrange
    case = case_factory(status="resolved")
    case.created_at = datetime.utcnow() - timedelta(hours=10)
    case.closed_at = datetime.utcnow()
    db_session.commit()

    # Act
    response = client.get("/api/admin/analytics", headers=admin_headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["avg_resolution_hours"] == pytest.approx(10.0, abs=0.1)


def test_analytics_is_available_to_supervisor(client, supervisor_headers):
    # The implemented RBAC contract grants analytics to supervisors as well as
    # super admins (see require_roles("supervisor", "super_admin") in admin.py).
    # Act
    response = client.get("/api/admin/analytics", headers=supervisor_headers)

    # Assert
    assert response.status_code == 200


@pytest.mark.parametrize(
    "headers_fixture", ["investigator_headers", "citizen_headers"]
)
def test_analytics_is_denied_below_supervisor(client, request, headers_fixture):
    # Arrange
    headers = request.getfixturevalue(headers_fixture)

    # Act
    response = client.get("/api/admin/analytics", headers=headers)

    # Assert
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/admin/custody
# ---------------------------------------------------------------------------

def test_super_admin_reads_global_custody_log(client, case_factory, admin_headers):
    # Arrange
    case_factory()
    case_factory()

    # Act
    response = client.get("/api/admin/custody", headers=admin_headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    assert {item["action"] for item in body["items"]} == {"case_created"}


def test_global_custody_can_be_filtered_and_paginated(
    client, case_factory, admin_headers
):
    # Arrange
    first = case_factory()
    case_factory()

    # Act
    by_case = client.get(
        "/api/admin/custody",
        params={"case_id": first.id},
        headers=admin_headers,
    )
    first_page = client.get(
        "/api/admin/custody", params={"page": 1, "limit": 1}, headers=admin_headers
    )

    # Assert
    assert by_case.status_code == 200
    assert by_case.json()["total"] == 1
    assert by_case.json()["items"][0]["case_id"] == first.id

    assert first_page.status_code == 200
    assert first_page.json()["total"] == 2
    assert len(first_page.json()["items"]) == 1


@pytest.mark.parametrize(
    "headers_fixture", ["supervisor_headers", "investigator_headers", "citizen_headers"]
)
def test_global_custody_is_super_admin_only(client, request, headers_fixture):
    # Arrange
    headers = request.getfixturevalue(headers_fixture)

    # Act
    response = client.get("/api/admin/custody", headers=headers)

    # Assert
    assert response.status_code == 403
