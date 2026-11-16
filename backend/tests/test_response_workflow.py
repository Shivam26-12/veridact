"""
VERIDACT — Response Workflow Tests

Covers POST /api/incidents/{case_id}/response: action validation, role/assignment
permissions, and the status transitions each action drives.
"""
import pytest


def _respond(client, case_id, action, headers, notes=None):
    payload = {"action": action}
    if notes is not None:
        payload["notes"] = notes
    return client.post(f"/api/incidents/{case_id}/response", json=payload, headers=headers)


# ---------------------------------------------------------------------------
# Allowed actions + transitions
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "action", ["contain", "eradicate", "recover", "notify_authority", "escalate"]
)
def test_non_terminal_action_moves_open_case_to_in_progress(
    client, users, case_factory, investigator_headers, action
):
    # Arrange
    case = case_factory(assignee=users["inv1"], status="open")

    # Act
    response = _respond(client, case.id, action, investigator_headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["response_status"] == action
    assert body["status"] == "in_progress"
    assert body["custody_log_id"]


def test_refer_action_sets_case_status_to_referred(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"], status="open")

    # Act
    response = _respond(client, case.id, "refer", investigator_headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["response_status"] == "refer"
    assert body["status"] == "referred"


def test_response_action_does_not_regress_resolved_case(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"], status="resolved")

    # Act
    response = _respond(client, case.id, "contain", investigator_headers)

    # Assert — only `open` cases are advanced; terminal statuses are preserved
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    assert response.json()["response_status"] == "contain"


def test_response_action_is_written_to_the_custody_log(
    client, users, case_factory, investigator_headers, admin_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"], status="open")

    # Act
    response = _respond(
        client, case.id, "contain", investigator_headers, notes="Host isolated"
    )
    assert response.status_code == 200

    # Assert
    logs = client.get(
        f"/api/cases/{case.id}/custody", headers=admin_headers
    ).json()
    status_logs = [log for log in logs if log["action"] == "status_updated"]
    assert len(status_logs) == 1
    assert "Response action: contain" in status_logs[0]["notes"]
    assert status_logs[0]["id"] == response.json()["custody_log_id"]


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

def test_unassigned_investigator_cannot_log_response(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv2"])

    # Act
    response = _respond(client, case.id, "contain", investigator_headers)

    # Assert
    assert response.status_code == 403


def test_citizen_cannot_log_response(
    client, users, case_factory, citizen_headers
):
    # Arrange
    case = case_factory(submitter=users["citizen1"])

    # Act
    response = _respond(client, case.id, "contain", citizen_headers)

    # Assert
    assert response.status_code == 403


def test_supervisor_can_log_response_on_any_case(
    client, users, case_factory, supervisor_headers
):
    # Arrange
    case = case_factory(assignee=users["inv2"])

    # Act
    response = _respond(client, case.id, "escalate", supervisor_headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["response_status"] == "escalate"


def test_super_admin_can_log_response_on_any_case(
    client, users, case_factory, admin_headers
):
    # Arrange
    case = case_factory()  # unassigned

    # Act
    response = _respond(client, case.id, "eradicate", admin_headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


# ---------------------------------------------------------------------------
# Invalid input
# ---------------------------------------------------------------------------

def test_unknown_response_action_returns_422(
    client, users, case_factory, investigator_headers
):
    # Arrange
    case = case_factory(assignee=users["inv1"])

    # Act
    response = _respond(client, case.id, "self_destruct", investigator_headers)

    # Assert
    assert response.status_code == 422
    assert "Unknown response action" in response.json()["detail"]


def test_response_action_on_missing_case_returns_404(
    client, investigator_headers
):
    # Act
    response = _respond(
        client,
        "00000000-0000-0000-0000-000000000000",
        "contain",
        investigator_headers,
    )

    # Assert
    assert response.status_code == 404
