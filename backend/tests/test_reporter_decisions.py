"""Reporter resolution decisions and investigation report coverage."""
from pathlib import Path
from sqlalchemy import create_engine, inspect, text
import fitz

from app.database import migrate_case_reporter_access_token_column
from app.models.custody_log import CustodyLog
from app.models.report import Report


def test_legacy_cases_table_migration_preserves_existing_rows():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE cases (id VARCHAR(36) PRIMARY KEY, case_number VARCHAR(20))"
        ))
        connection.execute(text(
            "INSERT INTO cases (id, case_number) VALUES ('old-case', 'INC-2025-000001')"
        ))

    migrate_case_reporter_access_token_column(engine)

    with engine.connect() as connection:
        row = connection.execute(text(
            "SELECT id, case_number, reporter_access_token_hash FROM cases"
        )).one()
    assert row.id == "old-case"
    assert row.case_number == "INC-2025-000001"
    assert row.reporter_access_token_hash is None
    assert "reporter_access_token_hash" in {
        column["name"] for column in inspect(engine).get_columns("cases")
    }
    engine.dispose()


def _anonymous_case(client):
    response = client.post("/api/cases/anonymous", json={
        "title": "Synthetic complaint for decision workflow",
        "description": "A synthetic report used to verify reporter review and resolution behavior.",
        "incident_type": "other",
    })
    assert response.status_code == 201
    body = response.json()
    assert body["reporter_access_token"]
    return body


def test_reporter_access_code_is_required_and_withdrawal_is_logged(client):
    case = _anonymous_case(client)

    denied = client.post(
        f"/api/public/cases/{case['case_number']}/decision",
        json={"action": "withdraw"},
    )
    withdrawn = client.post(
        f"/api/public/cases/{case['case_number']}/decision",
        json={"action": "withdraw", "reason": "Submitted to the wrong service."},
        headers={"X-Case-Access-Token": case["reporter_access_token"]},
    )
    tracked = client.get(
        f"/api/public/cases/{case['case_number']}",
        headers={"X-Case-Access-Token": case["reporter_access_token"]},
    )

    assert denied.status_code == 401
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"
    assert tracked.json()["status"] == "withdrawn"
    assert any("wrong service" in item["details"] for item in tracked.json()["reporter_actions"])


def test_only_reporter_access_code_can_withdraw(client):
    case = _anonymous_case(client)
    response = client.post(
        f"/api/public/cases/{case['case_number']}/decision",
        json={"action": "withdraw"},
        headers={"X-Case-Access-Token": "not-the-reporter-code"},
    )
    assert response.status_code == 403


def test_authenticated_citizen_can_withdraw_own_case_without_anonymous_code(
    client, users, citizen_headers
):
    created = client.post("/api/cases", json={
        "title": "Authenticated reporter decision test",
        "description": "A synthetic authenticated citizen case used for decision testing.",
        "incident_type": "other",
    }, headers=citizen_headers)
    assert created.status_code == 201

    response = client.post(
        f"/api/public/cases/{created.json()['case_number']}/decision",
        json={"action": "withdraw"},
        headers=citizen_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "withdrawn"


def test_reopen_requires_reason_and_approved_case_has_report(
    client, users, case_factory, admin_headers, db_session, monkeypatch, tmp_path
):
    from app import config

    monkeypatch.setattr(config, "REPORT_DIR", str(tmp_path / "reports"))
    case = case_factory(assignee=users["inv1"], status="under_review")
    access_code = case.reporter_access_token
    assert access_code

    client.patch(
        f"/api/cases/{case.id}",
        json={"note": "Investigator completed containment and documented findings."},
        headers=admin_headers,
    )
    approved = client.post(
        f"/api/cases/{case.id}/review",
        json={"decision": "approve"},
        headers=admin_headers,
    )
    reports = db_session.query(Report).filter(Report.case_id == case.id).all()
    public_report = next(report for report in reports if report.report_type == "public")

    missing_reason = client.post(
        f"/api/public/cases/{case.case_number}/decision",
        json={"action": "request_changes"},
        headers={"X-Case-Access-Token": access_code},
    )
    requested = client.post(
        f"/api/public/cases/{case.case_number}/decision",
        json={"action": "request_changes", "reason": "Explain how the source device was verified."},
        headers={"X-Case-Access-Token": access_code},
    )
    event = db_session.query(CustodyLog).filter(
        CustodyLog.case_id == case.id,
        CustodyLog.action == "reporter_requested_changes",
    ).one()
    download = client.get(
        f"/api/public/cases/{case.case_number}/investigation-report",
        headers={"X-Case-Access-Token": access_code},
    )

    assert approved.status_code == 200
    assert approved.json()["status"] == "resolved"
    assert len(reports) == 2
    assert all(Path(report.file_path).is_file() for report in reports)
    assert missing_reason.status_code == 422
    assert requested.status_code == 200
    assert requested.json()["status"] == "in_progress"
    assert "source device" in event.notes
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"


def test_reporter_accepts_resolved_case_and_downloads_report(
    client, users, case_factory, admin_headers, monkeypatch, tmp_path
):
    from app import config

    monkeypatch.setattr(config, "REPORT_DIR", str(tmp_path / "reports"))
    case = case_factory(assignee=users["inv1"], status="under_review")
    access_code = case.reporter_access_token
    approved = client.post(
        f"/api/cases/{case.id}/review",
        json={"decision": "approve"},
        headers=admin_headers,
    )
    downloaded = client.get(
        f"/api/public/cases/{case.case_number}/investigation-report",
        headers={"X-Case-Access-Token": access_code},
    )
    accepted = client.post(
        f"/api/public/cases/{case.case_number}/decision",
        json={"action": "accept"},
        headers={"X-Case-Access-Token": access_code},
    )

    assert approved.status_code == 200
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    assert downloaded.content.startswith(b"%PDF")
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "closed"


def test_reporter_pdf_excludes_internal_notes_but_includes_public_notes(
    client, users, case_factory, admin_headers, db_session
):
    case = case_factory(assignee=users["inv1"], status="under_review")
    access_code = case.reporter_access_token
    client.patch(
        f"/api/cases/{case.id}",
        json={"note": "Public summary: investigation steps completed.", "note_is_public": True},
        headers=admin_headers,
    )
    client.patch(
        f"/api/cases/{case.id}",
        json={"note": "INTERNAL SECRET: sensitive investigative lead.", "note_is_public": False},
        headers=admin_headers,
    )
    db_session.add(CustodyLog(
        case_id=case.id,
        action="status_updated",
        notes="LOG SECRET: internal host address and staff investigation detail.",
        performed_by=users["inv1"].id,
    ))
    db_session.commit()
    client.post(
        f"/api/cases/{case.id}/review",
        json={"decision": "approve"},
        headers=admin_headers,
    )
    report_rows = db_session.query(Report).filter(Report.case_id == case.id).all()
    public_report = next(report for report in report_rows if report.report_type == "public")
    staff_report = next(report for report in report_rows if report.report_type == "investigation")
    public_pdf = fitz.open(stream=Path(public_report.file_path).read_bytes(), filetype="pdf")
    staff_pdf = fitz.open(stream=Path(staff_report.file_path).read_bytes(), filetype="pdf")
    public_text = "\n".join(page.get_text() for page in public_pdf)
    staff_text = "\n".join(page.get_text() for page in staff_pdf)

    assert "Public summary" in public_text
    assert "INTERNAL SECRET" not in public_text
    assert "LOG SECRET" not in public_text
    assert "Response action or case status recorded" in public_text
    assert "INTERNAL SECRET" in staff_text
