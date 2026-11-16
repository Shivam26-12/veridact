"""
VERIDACT — Response Workflow Routes
Handles incident response actions: contain, eradicate, recover, notify.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.constants import RESPONSE_ACTIONS
from app.database import get_db
from app.models.case import Case
from app.models.user import User
from app.services import custody_service
from app.utils.security import get_current_user, require_roles

router = APIRouter(prefix="/api/incidents", tags=["Response Workflow"])


class ResponseActionRequest(BaseModel):
    action: str  # contain | eradicate | recover | notify_authority | escalate | refer
    notes: Optional[str] = None


def _assert_case_access(case: Case, current_user: User) -> None:
    """Investigators see assigned cases. Citizens see their own submissions."""
    if current_user.role == "investigator" and case.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: case not assigned to you")
    if current_user.role == "citizen" and case.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user.role not in ("investigator", "citizen", "supervisor", "super_admin"):
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/{case_id}/response")
async def log_response_action(
    case_id: str,
    body: ResponseActionRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("investigator", "supervisor", "super_admin")),
):
    """Logs a response workflow action against an incident and updates response status."""
    if body.action not in RESPONSE_ACTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown response action. Allowed: {', '.join(RESPONSE_ACTIONS)}",
        )

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Incident not found")
    if current_user.role == "investigator" and case.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: case not assigned to you")

    case.response_status = body.action
    if body.action == "refer":
        case.status = "referred"
    elif case.status == "open":
        case.status = "in_progress"
    case.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(case)

    log = custody_service.log_action(
        db=db,
        case_id=case.id,
        action="status_updated",
        performed_by_id=current_user.id,
        notes=f"Response action: {body.action}. {body.notes or ''}".strip(),
        ip_address=request.client.host if request.client else None,
    )

    return {
        "message": f"Response action '{body.action}' logged",
        "case_id": case.id,
        "status": case.status,
        "response_status": case.response_status,
        "custody_log_id": log.id if log else None,
    }


@router.get("/{case_id}/timeline")
async def get_incident_timeline(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns the full audit timeline for an incident, oldest event first."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Incident not found")
    _assert_case_access(case, current_user)

    logs = custody_service.get_case_custody(db, case_id)
    return [
        {
            "id": log.id,
            "action": log.action,
            "performed_by_id": log.performed_by,
            "performer_name": log.performer.name if log.performer else None,
            "notes": log.notes,
            "ip_address": log.ip_address,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log in logs
    ]
