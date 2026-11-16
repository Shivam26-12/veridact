"""
VERIDACT — Admin Service
User listing and incident analytics computed from the case table.
"""
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.constants import INCIDENT_TYPES, SEVERITY_LEVELS
from app.models.case import Case
from app.models.user import User


def list_users(db: Session) -> tuple[list[User], int]:
    """Return every user, newest first, and the total count."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return users, len(users)


def update_user(db: Session, user_id: str, updates: dict) -> User:
    """Updates user attributes. super_admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if updates.get("role") is not None:
        user.role = updates["role"]
    if updates.get("is_active") is not None:
        user.is_active = updates["is_active"]
    if updates.get("organization") is not None:
        user.organization = updates["organization"]
    db.commit()
    db.refresh(user)
    return user


def get_analytics(db: Session) -> dict:
    """
    Aggregate incident counts from the database.
    Average resolution time uses only cases that have been closed.
    """
    total = db.query(func.count(Case.id)).scalar() or 0
    open_cases = (
        db.query(func.count(Case.id)).filter(Case.status == "open").scalar() or 0
    )
    resolved_cases = (
        db.query(func.count(Case.id)).filter(Case.status == "resolved").scalar() or 0
    )
    critical_count = (
        db.query(func.count(Case.id)).filter(Case.severity == "critical").scalar() or 0
    )

    by_severity = {level: 0 for level in SEVERITY_LEVELS}
    for level, count in (
        db.query(Case.severity, func.count(Case.id)).group_by(Case.severity).all()
    ):
        if level in by_severity:
            by_severity[level] = count

    by_type = {kind: 0 for kind in INCIDENT_TYPES}
    for kind, count in (
        db.query(Case.incident_type, func.count(Case.id)).group_by(Case.incident_type).all()
    ):
        if kind in by_type:
            by_type[kind] = count

    closed = db.query(Case).filter(Case.closed_at.isnot(None)).all()
    if closed:
        hours = [
            (case.closed_at - case.created_at).total_seconds() / 3600
            for case in closed
        ]
        avg_resolution_hours = round(sum(hours) / len(hours), 2)
    else:
        avg_resolution_hours = 0.0

    recent = (
        db.query(Case)
        .order_by(Case.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "total_incidents": total,
        "open_cases": open_cases,
        "resolved_cases": resolved_cases,
        "critical_count": critical_count,
        "incidents_by_severity": by_severity,
        "incidents_by_type": by_type,
        "avg_resolution_hours": avg_resolution_hours,
        "recent_incidents": recent,
    }
