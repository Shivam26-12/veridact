"""
VERIDACT — Public Routes
Citizen-facing case tracking — no authentication required.
Returns ONLY safe public fields. Never exposes contact details or investigator data.
"""
import hashlib
import hmac
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.case import Case
from app.models.case_note import CaseNote
from app.models.custody_log import CustodyLog
from app.models.report import Report
from app.models.user import User
from app.utils.security import get_current_user_optional

router = APIRouter(prefix="/api/public", tags=["Public"])

# Human-friendly status labels for citizens
CITIZEN_STATUS_LABELS: dict[str, str] = {
    "open": "Received — Awaiting Assignment",
    "in_progress": "Under Active Investigation",
    "under_review": "Under Supervisory Review",
    "resolved": "Incident Resolved",
    "closed": "Case Closed",
    "referred": "Referred to Authority",
    "withdrawn": "Complaint Withdrawn",
}


class ReporterDecisionRequest(BaseModel):
    action: Literal["accept", "request_changes", "withdraw"]
    reason: Optional[str] = Field(None, max_length=2000)


def _authorized_case(
    db: Session,
    case_number: str,
    access_token: str | None,
    current_user: User | None = None,
) -> Case:
    case = db.query(Case).filter(Case.case_number == case_number.upper()).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user and current_user.role == "citizen" and case.submitted_by == current_user.id:
        return case
    if not case.reporter_access_token_hash or not access_token:
        raise HTTPException(status_code=401, detail="A valid reporter access code is required")
    supplied_hash = hashlib.sha256(access_token.encode()).hexdigest()
    if not hmac.compare_digest(case.reporter_access_token_hash, supplied_hash):
        raise HTTPException(status_code=403, detail="Invalid reporter access code")
    return case


@router.get("/cases/{case_number}")
async def track_case(
    case_number: str,
    db: Session = Depends(get_db),
    access_token: str | None = Header(None, alias="X-Case-Access-Token"),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Public citizen case tracking endpoint.
    Returns safe public subset only — NO contact_email, contact_phone, assigned_to, or internal notes.
    """
    case = db.query(Case).filter(Case.case_number == case_number.upper()).first()

    if not case:
        raise HTTPException(
            status_code=404,
            detail=f"No case found with number '{case_number}'. Please verify your receipt."
        )

    has_reporter_access = False
    if access_token:
        _authorized_case(db, case_number, access_token, current_user)
        has_reporter_access = True
    elif current_user and current_user.role == "citizen" and case.submitted_by == current_user.id:
        has_reporter_access = True

    # Fetch only public notes
    public_notes = (
        db.query(CaseNote)
        .filter(CaseNote.case_id == case.id, CaseNote.is_public == True)  # noqa: E712
        .order_by(CaseNote.created_at.asc())
        .all()
    )
    reporter_events = (
        db.query(CustodyLog)
        .filter(
            CustodyLog.case_id == case.id,
            CustodyLog.action.in_([
                "reporter_requested_changes",
                "reporter_accepted_resolution",
                "reporter_withdrew_case",
            ]),
        )
        .order_by(CustodyLog.timestamp.asc())
        .all()
    )
    investigation_report = (
        db.query(Report)
        .filter(Report.case_id == case.id, Report.report_type == "public")
        .order_by(Report.generated_at.desc())
        .first()
    )

    return {
        "case_number": case.case_number,
        "status": case.status,
        "status_label": CITIZEN_STATUS_LABELS.get(case.status, case.status),
        "incident_type": case.incident_type,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
        "public_notes": [note.content for note in public_notes],
        "reporter_actions": [
            {
                "action": event.action,
                "details": event.notes,
                "timestamp": event.timestamp.isoformat() if event.timestamp else None,
            }
            for event in reporter_events
        ] if has_reporter_access else [],
        "investigation_report_available": bool(investigation_report),
        "reporter_actions_available": bool(
            case.reporter_access_token_hash
            or (
                current_user
                and current_user.role == "citizen"
                and case.submitted_by == current_user.id
            )
        ),
    }


@router.post("/cases/{case_number}/decision")
async def submit_reporter_decision(
    case_number: str,
    body: ReporterDecisionRequest,
    db: Session = Depends(get_db),
    access_token: str | None = Header(None, alias="X-Case-Access-Token"),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Allow the verified reporter to accept, request more transparency, or withdraw."""
    case = _authorized_case(db, case_number, access_token, current_user)
    now = datetime.utcnow()

    if body.action == "accept":
        if case.status != "resolved":
            raise HTTPException(status_code=409, detail="Only a resolved case can be accepted")
        case.status = "closed"
        case.closed_at = now
        action = "reporter_accepted_resolution"
        notes = "Reporter accepted the investigation outcome and closed the case"
    elif body.action == "request_changes":
        reason = (body.reason or "").strip()
        if not reason:
            raise HTTPException(
                status_code=422,
                detail="Explain what additional justification or transparency is required",
            )
        if case.status not in {"resolved", "closed"}:
            raise HTTPException(status_code=409, detail="Only a resolved case can be reopened")
        case.status = "in_progress"
        case.closed_at = None
        action = "reporter_requested_changes"
        notes = f"Reporter requested further justification/transparency: {reason}"
    else:
        if case.status not in {"open", "in_progress", "under_review", "referred"}:
            raise HTTPException(status_code=409, detail="Only an active case can be withdrawn")
        case.status = "withdrawn"
        case.closed_at = None
        action = "reporter_withdrew_case"
        notes = "Reporter withdrew the complaint"
        if body.reason and body.reason.strip():
            notes += f": {body.reason.strip()}"

    case.updated_at = now
    db.add(CustodyLog(
        case_id=case.id,
        action=action,
        notes=notes,
        timestamp=now,
    ))
    db.commit()
    db.refresh(case)
    return {
        "case_number": case.case_number,
        "status": case.status,
        "status_label": CITIZEN_STATUS_LABELS.get(case.status, case.status),
        "message": notes,
    }


@router.get("/cases/{case_number}/investigation-report")
async def download_investigation_report(
    case_number: str,
    db: Session = Depends(get_db),
    access_token: str | None = Header(None, alias="X-Case-Access-Token"),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Download the final investigation PDF after verifying reporter ownership."""
    case = _authorized_case(db, case_number, access_token, current_user)
    report = (
        db.query(Report)
        .filter(Report.case_id == case.id, Report.report_type == "public")
        .order_by(Report.generated_at.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Investigation report not found")
    return FileResponse(
        report.file_path,
        media_type="application/pdf",
        filename=f"{case.case_number}-investigation-report.pdf",
    )
