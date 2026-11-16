"""
VERIDACT — Case Lifecycle Tests

Covers public and authenticated incident creation, role-scoped listing,
filtering, status updates, and severity triage.
"""
import re

import pytest

from app.constants import CASE_STATUSES, SEVERITY_LEVELS

CASE_NUMBER_PATTERN = re.compile(r"^INC-\d{4}-\d{6}$")


def _public_payload(**overrides):
    payload = {
        "title": "Phishing email impersonating IT support",
        "description": (
            "A staff member received an email asking them to reset their VPN "
            "password on a look-alike portal."
        ),
        "incident_type": "phishing",
        "contact_email": "reporter@example.com",
        "location": "Head Office",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Incident creation
# ---------------------------------------------------------------------------

def test_anonymous_public_incident_creation(client):
    # Arrange
    payload = _public_payload()

    # Act
    response = client.post("/api/cases/anonymous", json=payload)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert CASE_NUMBER_PATTERN.match(body["case_number"])
    assert body["incident_type"] == "phishing"
    assert body["status"] == "open"
    assert body["severity"] == "medium"
    assert body["submitted_by"] is None
    assert body["submitter_name"] is None


def test_authenticated_incident_creation_links_submitter(
    client, users, citizen_headers
):
    # Arrange
    payload = _public_payload(title="Ransomware note on shared drive")

    # Act
    response = client.post("/api/cases", json=payload, headers=citizen_headers)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert body["submitted_by"] == users["citizen1"].id
    assert body["submitter_name"] == users["citizen1"].name
    assert CASE_NUMBER_PATTERN.match(body["case_number"])


def test_incident_creation_requires_authentication(client):
    # Act — the non-anonymous endpoint is guarded by get_current_user
    response = client.post("/api/cases", json=_public_payload())

    # Assert
    assert response.status_code in (401, 403)


@pytest.mark.parametrize(
    "overrides",
    [
        {"incident_type": "cosmic_ray"},
        {"description": "too short"},
        {"title": ""},
    ],
)
def test_incident_creation_validates_payload(client, overrides):
    # Act
    response = client.post(
        "/api/cases/anonymous", json=_public_payload(**overrides)
    )

    # Assert
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Role-based listing
# ---------------------------------------------------------------------------

def test_investigator_sees_only_assigned_cases(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case_factory(assignee=users["inv1"])
    case_factory(assignee=users["inv1"], status="in_progress")
    case_factory(assignee=users["inv2"])
    case_factory()  # unassigned

    # Act
    response = client.get("/api/cases", headers=investigator_headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {item["assigned_to"] for item in body["items"]} == {users["inv1"].id}


def test_admin_sees_all_cases(client, case_factory, admin_headers):
    # Arrange
    case_factory()
    case_factory(status="in_progress")
    case_factory(status="resolved")

    # Act
    response = client.get("/api/cases", headers=admin_headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["total"] == 3


def test_supervisor_sees_all_cases(client, case_factory, supervisor_headers):
    # Arrange
    case_factory()
    case_factory()

    # Act
    response = client.get("/api/cases", headers=supervisor_headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["total"] == 2


def test_citizen_sees_only_own_submissions(
    client, users, case_factory, citizen_headers
):
    # Arrange
    case_factory(submitter=users["citizen1"])
    case_factory(submitter=users["citizen2"])
    client.post("/api/cases/anonymous", json=_public_payload())

    # Act
    response = client.get("/api/cases", headers=citizen_headers)

    # Assert
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["submitted_by"] == users["citizen1"].id


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

def test_case_list_filters_by_status_and_severity(
    client, users, case_factory, admin_headers
):
    # Arrange
    critical_open = case_factory(
        assignee=users["inv1"],
        status="open",
        severity="critical",
        incident_type="phishing",
        title="CEO fraud phishing campaign",
    )
    case_factory(
        assignee=users["inv1"],
        status="resolved",
        severity="low",
        incident_type="malware",
        title="Malware on reception laptop",
    )
    case_factory(status="open", severity="high", incident_type="phishing")

    # Act
    response = client.get(
        "/api/cases",
        params={"status": "open", "severity": "critical"},
        headers=admin_headers,
    )

    # Assert
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == critical_open.id


def test_case_list_filters_by_incident_type_and_search(
    client, users, case_factory, admin_headers
):
    # Arrange
    target = case_factory(
        title="Credential phishing wave", incident_type="phishing"
    )
    case_factory(title="Disk encryption outbreak", incident_type="ransomware")

    # Act
    by_type = client.get(
        "/api/cases", params={"incident_type": "phishing"}, headers=admin_headers
    )
    by_search = client.get(
        "/api/cases", params={"search": "Credential"}, headers=admin_headers
    )

    # Assert
    assert [item["id"] for item in by_type.json()["items"]] == [target.id]
    assert [item["id"] for item in by_search.json()["items"]] == [target.id]


def test_case_list_pagination(client, admin_headers):
    # Arrange
    created_ids = []
    for index in range(3):
        response = client.post(
            "/api/cases/anonymous",
            json=_public_payload(title=f"Incident {index}"),
        )
        created_ids.append(response.json()["id"])

    # Act
    page_one = client.get(
        "/api/cases", params={"page": 1, "limit": 2}, headers=admin_headers
    )
    page_two = client.get(
        "/api/cases", params={"page": 2, "limit": 2}, headers=admin_headers
    )

    # Assert
    assert page_one.json()["total"] == 3
    assert len(page_one.json()["items"]) == 2
    assert len(page_two.json()["items"]) == 1
    returned = {item["id"] for item in page_one.json()["items"]}
    returned |= {item["id"] for item in page_two.json()["items"]}
    assert returned == set(created_ids)


# ---------------------------------------------------------------------------
# Case detail
# ---------------------------------------------------------------------------

def test_case_detail_includes_internal_notes_for_staff(
    client, users, case_factory, admin_headers, citizen_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"], submitter=users["citizen1"])
    client.patch(
        f"/api/cases/{case.id}",
        json={"note": "Initial triage complete; isolating host."},
        headers=admin_headers,
    )

    # Act
    staff_view = client.get(f"/api/cases/{case.id}", headers=admin_headers)
    citizen_view = client.get(f"/api/cases/{case.id}", headers=citizen_headers)

    # Assert
    assert staff_view.status_code == 200
    assert staff_view.json()["evidence"] == []
    assert len(staff_view.json()["notes"]) == 1
    assert "Initial triage" in staff_view.json()["notes"][0]["content"]

    # Internal notes are hidden from citizens
    assert citizen_view.status_code == 200
    assert citizen_view.json()["notes"] == []


def test_get_missing_case_returns_404(client, admin_headers):
    # Act
    response = client.get(
        "/api/cases/00000000-0000-0000-0000-000000000000", headers=admin_headers
    )

    # Assert
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Case updates + severity triage
# ---------------------------------------------------------------------------

def test_assigned_investigator_can_update_status(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"])

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"status": "in_progress"},
        headers=investigator_headers,
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


def test_investigator_submits_completed_case_for_admin_review(
    client, users, case_factory, investigator_headers
):
    case = case_factory(assignee=users["inv1"], status="in_progress")

    response = client.patch(
        f"/api/cases/{case.id}",
        json={"status": "under_review"},
        headers=investigator_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "under_review"


def test_investigator_cannot_mark_case_resolved(
    client, users, case_factory, investigator_headers
):
    case = case_factory(assignee=users["inv1"], status="in_progress")

    response = client.patch(
        f"/api/cases/{case.id}",
        json={"status": "resolved"},
        headers=investigator_headers,
    )

    assert response.status_code == 403


def test_admin_returns_resolution_with_required_reason(
    client, users, case_factory, admin_headers
):
    case = case_factory(assignee=users["inv1"], status="under_review")

    missing_reason = client.post(
        f"/api/cases/{case.id}/review",
        json={"decision": "return", "reason": "  "},
        headers=admin_headers,
    )
    returned = client.post(
        f"/api/cases/{case.id}/review",
        json={"decision": "return", "reason": "Attach the updated impact analysis."},
        headers=admin_headers,
    )
    detail = client.get(f"/api/cases/{case.id}", headers=admin_headers)

    assert missing_reason.status_code == 422
    assert returned.status_code == 200
    assert returned.json()["status"] == "in_progress"
    assert "Attach the updated impact analysis." in detail.json()["notes"][0]["content"]


def test_admin_approves_resolution_only_after_review(
    client, users, case_factory, admin_headers
):
    case = case_factory(assignee=users["inv1"], status="under_review")

    response = client.post(
        f"/api/cases/{case.id}/review",
        json={"decision": "approve"},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"


def test_assigned_investigator_can_triage_severity(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"], severity="medium")

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"severity": "critical"},
        headers=investigator_headers,
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["severity"] == "critical"


def test_investigator_cannot_update_unassigned_case(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv2"])

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"status": "in_progress"},
        headers=investigator_headers,
    )

    # Assert
    assert response.status_code == 403


def test_citizen_cannot_update_case(client, users, case_factory, citizen_headers):
    # Arrange
    case = case_factory(submitter=users["citizen1"])

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"status": "resolved"},
        headers=citizen_headers,
    )

    # Assert
    assert response.status_code == 403


def test_investigator_cannot_reassign_case(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"])

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"assigned_to": users["inv2"].id},
        headers=investigator_headers,
    )

    # Assert
    assert response.status_code == 403


def test_admin_can_reassign_and_retriage(
    client, users, case_factory, admin_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"], severity="low")

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"assigned_to": users["inv2"].id, "severity": "critical"},
        headers=admin_headers,
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["assigned_to"] == users["inv2"].id
    assert body["assignee_name"] == users["inv2"].name
    assert body["severity"] == "critical"


def test_admin_can_reassign_to_unknown_user(
    client, users, case_factory, admin_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"])

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"assigned_to": "00000000-0000-0000-0000-000000000000"},
        headers=admin_headers,
    )

    # Assert
    assert response.status_code == 404


def test_closing_case_records_closed_at(client, users, case_factory, admin_headers):
    # Arrange
    case = case_factory(assignee=users["inv1"], status="in_progress")

    # Act
    response = client.patch(
        f"/api/cases/{case.id}", json={"status": "closed"}, headers=admin_headers
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "closed"
    assert body["closed_at"] is not None


def test_invalid_status_is_rejected(client, users, case_factory, admin_headers):
    # Arrange
    case = case_factory(assignee=users["inv1"])

    # Act
    response = client.patch(
        f"/api/cases/{case.id}",
        json={"status": "vanished"},
        headers=admin_headers,
    )

    # Assert
    assert response.status_code == 422


@pytest.mark.parametrize("status", CASE_STATUSES)
def test_every_documented_status_is_accepted(
    client, users, case_factory, admin_headers, status
):
    # Arrange
    case = case_factory(
        assignee=users["inv1"],
        status="under_review" if status == "resolved" else None,
    )

    if status == "withdrawn":
        response = client.patch(
            f"/api/cases/{case.id}",
            json={"status": status},
            headers=admin_headers,
        )
        assert response.status_code == 403
        return

    # Act
    if status == "resolved":
        response = client.post(
            f"/api/cases/{case.id}/review",
            json={"decision": "approve"},
            headers=admin_headers,
        )
    else:
        response = client.patch(
            f"/api/cases/{case.id}", json={"status": status}, headers=admin_headers
        )

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == status


@pytest.mark.parametrize("severity", SEVERITY_LEVELS)
def test_every_documented_severity_is_accepted(
    client, users, case_factory, admin_headers, severity
):
    # Arrange
    case = case_factory(assignee=users["inv1"])

    # Act
    response = client.patch(
        f"/api/cases/{case.id}", json={"severity": severity}, headers=admin_headers
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["severity"] == severity
