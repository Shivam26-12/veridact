"""
VERIDACT — Evidence Routes
Handles evidence upload, retrieval, and listing.
"""
from pathlib import Path
from fastapi.responses import FileResponse, RedirectResponse
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from app import config
from app.database import get_db
from app.models.evidence import Evidence
from app.models.user import User
from app.schemas.evidence_schemas import (
    EvidenceResponse,
    EvidenceUploadResponse,
    EvidenceListResponse,
)
from app.services import case_service, evidence_service, custody_service
from app.utils.security import get_current_user, get_current_user_optional, require_roles

router = APIRouter(prefix="/api", tags=["Evidence"])


def _evidence_response(evidence, current_user: User | None = None):
    response = EvidenceResponse.model_validate(evidence)
    if current_user and current_user.role in {"investigator", "supervisor", "super_admin"}:
        response.file_url = evidence_service.get_file_url(evidence)
    return response


@router.post("/cases/{case_id}/evidence", response_model=EvidenceUploadResponse, status_code=201)
async def upload_evidence(
    case_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Upload evidence file for a case.
    Validates MIME type and size server-side. Computes SHA-256 during streaming.
    """
    # Verify case exists
    from app.models.case import Case
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Save file and compute hash
    save_result = await evidence_service.save_upload_file(file, case_id)

    # Create DB record with custody log
    evidence = evidence_service.create_evidence_record(
        db=db,
        case_id=case_id,
        save_result=save_result,
        uploaded_by_id=current_user.id if current_user else None,
    )

    response = _evidence_response(evidence)
    return EvidenceUploadResponse(**response.model_dump())


@router.get("/cases/{case_id}/evidence", response_model=EvidenceListResponse)
async def list_case_evidence(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lists all evidence items for a case."""
    from app.models.case import Case
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    items = evidence_service.list_case_evidence(db, case_id)
    case_service.get_case(case_id, current_user)
    return EvidenceListResponse(items=[_evidence_response(e, current_user) for e in items])


@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
async def get_evidence(
    evidence_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieves a single evidence record. Logs evidence_accessed custody event."""
    evidence = evidence_service.get_evidence(db, evidence_id, current_user)
    case_service.get_case(db, evidence.case_id, current_user)
    return _evidence_response(evidence, current_user)


@router.get("/evidence/{evidence_id}/file")
async def get_evidence_file(
    evidence_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("investigator", "supervisor", "super_admin")),
):
    """Returns a case-authorized evidence file for preview or download."""
    evidence = db.query(Evidence).filter_by(id=evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    case_service.get_case(db, evidence.case_id, current_user)

    if evidence.file_path.startswith("cloudinary://"):
        file_url = evidence_service.get_file_url(evidence)
        if not file_url:
            raise HTTPException(status_code=502, detail="Could not create secure evidence URL")
        return RedirectResponse(file_url)

    backend_root = Path(__file__).resolve().parents[2]
    evidence_root = (backend_root / config.UPLOAD_DIR / "evidence").resolve()
    stored_path = Path(evidence.file_path)
    file_path = stored_path if stored_path.is_absolute() else (backend_root / stored_path)
    file_path = file_path.resolve()
    try:
        file_path.relative_to(evidence_root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Evidence file not found") from exc
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Evidence file not found")

    custody_service.log_action(
        db=db,
        case_id=evidence.case_id,
        action="evidence_accessed",
        performed_by_id=current_user.id,
        evidence_id=evidence.id,
        notes=f"Evidence '{evidence.original_filename}' previewed by {current_user.email}",
    )
    return FileResponse(
        path=file_path,
        media_type=evidence.mime_type,
        filename=evidence.original_filename,
        content_disposition_type="inline" if evidence.mime_type.startswith("image/") else "attachment",
    )


@router.delete("/evidence/{evidence_id}", status_code=204)
async def delete_evidence(
    evidence_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("super_admin")),
):
    """Deletes an evidence record and its file. super_admin only."""
    evidence = db.query(Evidence).filter_by(id=evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    try:
        evidence_service.delete_stored_file(evidence)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to delete stored evidence") from e

    custody_service.log_action(
        db=db,
        case_id=evidence.case_id,
        action="evidence_uploaded",  # Using closest available action
        performed_by_id=current_user.id,
        evidence_id=evidence_id,
        notes=f"Evidence '{evidence.original_filename}' deleted by super_admin",
    )

    db.delete(evidence)
    db.commit()
