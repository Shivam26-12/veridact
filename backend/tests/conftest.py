"""
VERIDACT — Shared Pytest Fixtures

Isolation model:
- Each test runs against a brand-new in-memory SQLite schema that is created
  before the test and dropped afterwards, so no state bleeds between tests.
- FastAPI's `get_db` dependency is overridden to hand out sessions bound to the
  test engine; the API never touches the development `veridact.db` file.
- `StaticPool` is required: an in-memory SQLite database lives inside a single
  connection, while TestClient executes requests on a worker thread.
"""
import os
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Point the application's global engine at a throwaway in-memory database.
# This must happen before any `app.*` module is imported by the test suite.
os.environ["DATABASE_URL"] = "sqlite://"

from app import models  # noqa: E402,F401  (registers every table on Base.metadata)
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.schemas.case_schemas import CreateCaseRequest  # noqa: E402
from app.services import auth_service, case_service  # noqa: E402
from app.utils.security import create_access_token  # noqa: E402

TEST_PASSWORD = "demo1234"

# bcrypt's cost factor has no bearing on correctness and dominates test runtime.
# The hash is computed once at 4 rounds; the application's full-strength context
# still verifies it correctly because the cost is embedded in the hash itself.
_fast_context = auth_service.pwd_context.copy(bcrypt__rounds=4)
TEST_PASSWORD_HASH = _fast_context.hash(TEST_PASSWORD)

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=TEST_ENGINE
)


# ---------------------------------------------------------------------------
# Database + application client
# ---------------------------------------------------------------------------

@pytest.fixture()
def _db_schema():
    """Create a pristine schema for one test and tear it down afterwards."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture()
def db_session(_db_schema):
    """SQLAlchemy session for arranging data and asserting persisted state."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(_db_schema):
    """FastAPI TestClient wired to the in-memory test database."""

    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Seeded accounts + authenticated headers
# ---------------------------------------------------------------------------

_USER_SPECS = [
    ("admin", "admin@veridact.com", "Avery Admin", "super_admin"),
    ("supervisor", "supervisor@veridact.com", "Sage Supervisor", "supervisor"),
    ("inv1", "inv1@veridact.com", "Iris Investigator", "investigator"),
    ("inv2", "inv2@veridact.com", "Ivan Investigator", "investigator"),
    ("citizen1", "citizen1@veridact.com", "Cora Citizen", "citizen"),
    ("citizen2", "citizen2@veridact.com", "Caleb Citizen", "citizen"),
]


@pytest.fixture()
def users(db_session):
    """
    Seed the six demo accounts and return them keyed by short name.

    Each entry exposes `.id`, `.email`, `.name`, `.role`, `.token` and
    `.headers` (a ready-to-use Authorization header dict).
    """
    for _, email, name, role in _USER_SPECS:
        db_session.add(
            User(
                email=email,
                password_hash=TEST_PASSWORD_HASH,
                name=name,
                role=role,
                is_active=True,
            )
        )
    db_session.commit()

    accounts = {}
    for key, email, _, _ in _USER_SPECS:
        user = db_session.query(User).filter(User.email == email).one()
        token = create_access_token({"sub": user.id})
        accounts[key] = SimpleNamespace(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            token=token,
            headers={"Authorization": f"Bearer {token}"},
        )
    return accounts


@pytest.fixture()
def admin_headers(users):
    return users["admin"].headers


@pytest.fixture()
def supervisor_headers(users):
    return users["supervisor"].headers


@pytest.fixture()
def investigator_headers(users):
    return users["inv1"].headers


@pytest.fixture()
def investigator2_headers(users):
    return users["inv2"].headers


@pytest.fixture()
def citizen_headers(users):
    return users["citizen1"].headers


# ---------------------------------------------------------------------------
# Case factory
# ---------------------------------------------------------------------------

_DEFAULT_CASE = {
    "title": "Suspicious login from unknown host",
    "description": (
        "Multiple failed VPN logins were followed by a successful login "
        "from an unrecognised IP address."
    ),
    "incident_type": "phishing",
}


@pytest.fixture()
def case_factory(db_session):
    """
    Create a case through the real service layer (so case numbering and the
    `case_created` custody entry behave exactly as in production), then apply
    optional assignment/status/severity overrides.
    """

    def _create_case(
        *,
        submitter=None,
        assignee=None,
        status=None,
        severity=None,
        **overrides,
    ):
        payload_data = {**_DEFAULT_CASE, **overrides}
        payload = CreateCaseRequest(**payload_data)
        case = case_service.create_case(
            db_session,
            payload,
            submitter_id=submitter.id if submitter else None,
        )

        if assignee is not None:
            case.assigned_to = assignee.id
        if status is not None:
            case.status = status
        if severity is not None:
            case.severity = severity

        db_session.commit()
        db_session.refresh(case)
        return case

    return _create_case
