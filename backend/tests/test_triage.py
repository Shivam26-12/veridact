"""AI-assisted case triage tests; all Gemini calls are mocked."""
from app import config
from sqlalchemy import create_engine, text
from app.models.case_triage import CaseTriage
from app.services import triage_service
from app.database import migrate_case_triage_score_column


def test_legacy_triage_score_column_is_migrated_without_data_loss():
    legacy_engine = create_engine("sqlite://")
    with legacy_engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE case_triage (id VARCHAR(36) PRIMARY KEY, authenticity_score INTEGER)"
        ))
        connection.execute(text(
            "INSERT INTO case_triage (id, authenticity_score) VALUES ('legacy-case', 42)"
        ))

    migrate_case_triage_score_column(legacy_engine)
    migrate_case_triage_score_column(legacy_engine)

    with legacy_engine.connect() as connection:
        migrated_score = connection.execute(text(
            "SELECT report_detail_score FROM case_triage WHERE id = 'legacy-case'"
        )).scalar_one()
    assert migrated_score == 42
    legacy_engine.dispose()


def test_prediction_marks_low_detail_report_as_low_priority(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(config, "GEMINI_MODEL", "gemini-test")

    class MockResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "candidates": [{
                    "content": {"parts": [{"text": '{"predicted_severity":"medium","report_detail_score":12,"summary":"Limited incident detail."}'}]}
                }]
            }

    def mock_post(url, **kwargs):
        assert url.endswith("/gemini-test:generateContent")
        assert kwargs["headers"]["x-goog-api-key"] == "test-key"
        return MockResponse()

    monkeypatch.setattr(triage_service.requests, "post", mock_post)
    result = triage_service.predict_case_triage(
        "Issue", "other", "A report with limited information.", False
    )

    assert result["predicted_severity"] == "medium"
    assert result["report_detail_score"] == 12
    assert result["review_priority"] == "low"


def test_high_predicted_severity_overrides_low_score_priority(monkeypatch):
    assert triage_service._review_priority("critical", 5) == "urgent"


def test_nonurgent_high_score_uses_standard_priority():
    assert triage_service._review_priority("medium", 80) == "standard"


def test_admin_can_request_case_triage_again(client, users, case_factory, admin_headers):
    case = case_factory()

    response = client.post(f"/api/cases/{case.id}/triage", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["triage_status"] == "unavailable"
    assert response.json()["report_detail_score"] is None


def test_non_admin_cannot_request_case_triage_again(
    client, users, case_factory, investigator_headers
):
    case = case_factory(assignee=users["inv1"])

    response = client.post(f"/api/cases/{case.id}/triage", headers=investigator_headers)

    assert response.status_code == 403


def test_admin_case_queue_orders_urgent_before_low_priority(
    client, case_factory, admin_headers, db_session
):
    low_priority = case_factory(title="Low detail case")
    urgent_priority = case_factory(title="Urgent case")
    db_session.add_all([
        CaseTriage(
            case_id=low_priority.id,
            triage_status="complete",
            predicted_severity="low",
            report_detail_score=10,
            review_priority="low",
        ),
        CaseTriage(
            case_id=urgent_priority.id,
            triage_status="complete",
            predicted_severity="critical",
            report_detail_score=10,
            review_priority="urgent",
        ),
    ])
    db_session.commit()

    response = client.get("/api/cases", headers=admin_headers)

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"][:2]] == [
        urgent_priority.id,
        low_priority.id,
    ]
