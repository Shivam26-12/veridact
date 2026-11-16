"""
VERIDACT — Database Configuration
SQLAlchemy engine with WAL mode + foreign keys for SQLite.
"""
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app import config

SQLALCHEMY_DATABASE_URL = config.DATABASE_URL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Required for SQLite + FastAPI
)


# Enable WAL mode for better concurrent read performance
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def migrate_case_triage_score_column(target_engine=engine) -> None:
    """Add the renamed report-detail score column to existing databases."""
    inspector = inspect(target_engine)
    if "case_triage" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("case_triage")}
    if "report_detail_score" in columns:
        return

    with target_engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE case_triage ADD COLUMN report_detail_score INTEGER")
        )
        if "authenticity_score" in columns:
            connection.execute(text(
                "UPDATE case_triage "
                "SET report_detail_score = authenticity_score "
                "WHERE report_detail_score IS NULL"
            ))


def migrate_case_reporter_access_token_column(target_engine=engine) -> None:
    """Add the nullable anonymous-reporter token hash to existing case tables."""
    inspector = inspect(target_engine)
    if "cases" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("cases")}
    if "reporter_access_token_hash" not in columns:
        with target_engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE cases ADD COLUMN reporter_access_token_hash VARCHAR(64)"
            ))


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
