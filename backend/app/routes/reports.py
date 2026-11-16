"""
VERIDACT — Reports Routes
Handles report generation and retrieval.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.report import Report
from app.models.user import User
from app.schemas.report_schemas import ReportListResponse, ReportResponse
from app.services import case_service, report_service
from app.utils.security import get_current_user, require_roles

router = APIRouter(prefix="/api", tags=["Reports"])


@router.post("/cases/{case_id}/report")
async def generate_report(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("investigator", "supervisor", "super_admin")),
):
    """Generate a current investigation PDF from the case record and audit trail."""
    case = case_service.get_case(db, case_id, current_user)
    report = report_service.create_investigation_report(db, case, current_user.id)
    db.commit()
    db.refresh(report)
    return {"report_id": report.id, "message": "Investigation report generated"}


@router.get("/reports/{report_id}")
async def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    case = case_service.get_case(db, report.case_id, current_user)
    if current_user.role == "citizen" and case.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return FileResponse(
        report.file_path,
        media_type="application/pdf",
        filename=f"{case.case_number}-investigation-report.pdf",
    )


@router.get("/cases/{case_id}/reports")
async def list_case_reports(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = case_service.get_case(db, case_id, current_user)
    if current_user.role == "citizen" and case.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    reports = (
        db.query(Report)
        .filter(Report.case_id == case.id)
        .order_by(Report.generated_at.desc())
        .all()
    )
    return ReportListResponse(items=[ReportResponse.model_validate(report) for report in reports])
