"""
VERIDACT — Evidence Service
Handles file streaming, SHA-256 computation, storage, and evidence DB records.
"""
import os
import uuid
import logging
import hashlib
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.models.evidence import Evidence
from app.models.user import User
from app.utils.file_validation import validate_upload
from app.services import custody_service
from app import config

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024  # 64 KB


@dataclass
class EvidenceSaveResult:
    """Result of storing an uploaded evidence file."""
    stored_filename: str
    file_path: str
    original_filename: str
    file_type: str
    mime_type: str
    file_size: int
    sha256_hash: str


async def save_upload_file(upload_file: UploadFile, case_id: str) -> EvidenceSaveResult:
    """
    Validate, stream to uploads/evidence/{uuid}.ext, compute SHA-256 during streaming.
    Returns EvidenceSaveResult with all metadata needed for the DB record.
    """
    # Read all content (needed for validation and to stream-hash simultaneously)
    file_content = await upload_file.read()

    # Validate — raises HTTPException 413/415 on failure
    original_filename = upload_file.filename or "unknown"
    file_type, mime_type = validate_upload(file_content, original_filename)

    sha256_hash = hashlib.sha256(file_content).hexdigest()
    _, ext = os.path.splitext(original_filename.lower())
    public_id = str(uuid.uuid4())

    if file_type == "screenshot" and config.CLOUDINARY_URL:
        try:
            import cloudinary
            from cloudinary import uploader

            cloudinary.config(cloudinary_url=config.CLOUDINARY_URL)
            result = uploader.upload(
                file_content,
                public_id=public_id,
                resource_type="image",
                type="authenticated",
                overwrite=False,
                unique_filename=False,
            )
            cloudinary_public_id = result["public_id"]
            return EvidenceSaveResult(
                stored_filename=cloudinary_public_id,
                file_path=f"cloudinary://image/authenticated/{cloudinary_public_id}",
                original_filename=original_filename,
                file_type=file_type,
                mime_type=mime_type,
                file_size=len(file_content),
                sha256_hash=sha256_hash,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Cloudinary upload failed")
            raise HTTPException(status_code=502, detail="Cloudinary image upload failed") from e

    stored_name = f"{public_id}{ext}"

    # Build storage path
    evidence_dir = os.path.join(config.UPLOAD_DIR, "evidence")
    os.makedirs(evidence_dir, exist_ok=True)
    file_path = os.path.join(evidence_dir, stored_name)

    written = 0
    try:
        with open(file_path, "wb") as f:
            offset = 0
            while offset < len(file_content):
                chunk = file_content[offset: offset + CHUNK_SIZE]
                f.write(chunk)
                written += len(chunk)
                offset += CHUNK_SIZE
    except Exception as e:
        # Clean up partial file on failure
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error("Failed to write evidence file: %s", e)
        raise HTTPException(status_code=500, detail="Failed to store evidence file")

    return EvidenceSaveResult(
        stored_filename=stored_name,
        file_path=file_path,
        original_filename=original_filename,
        file_type=file_type,
        mime_type=mime_type,
        file_size=written,
        sha256_hash=sha256_hash,
    )


def get_file_url(evidence: Evidence) -> Optional[str]:
    """Create a short-lived URL for a private Cloudinary image."""
    if not evidence.file_path.startswith("cloudinary://"):
        return None

    try:
        import cloudinary
        from cloudinary.utils import private_download_url

        resource_type, delivery_type, public_id = evidence.file_path.removeprefix(
            "cloudinary://"
        ).split("/", 2)
        cloudinary.config(cloudinary_url=config.CLOUDINARY_URL)
        image_format = "jpg" if evidence.mime_type == "image/jpeg" else evidence.mime_type.split("/")[-1]
        return private_download_url(
            public_id,
            image_format,
            resource_type=resource_type,
            type=delivery_type,
            expires_at=int(time.time()) + config.CLOUDINARY_URL_EXPIRY_SECONDS,
        )
    except Exception:
        logger.exception("Could not generate Cloudinary evidence URL")
        return None


def delete_stored_file(evidence: Evidence) -> None:
    """Delete an evidence asset from Cloudinary or local storage."""
    if evidence.file_path.startswith("cloudinary://"):
        import cloudinary
        from cloudinary import uploader

        resource_type, delivery_type, public_id = evidence.file_path.removeprefix(
            "cloudinary://"
        ).split("/", 2)
        cloudinary.config(cloudinary_url=config.CLOUDINARY_URL)
        uploader.destroy(public_id, resource_type=resource_type, type=delivery_type)
    elif evidence.file_path and os.path.exists(evidence.file_path):
        os.remove(evidence.file_path)


def create_evidence_record(
    db: Session,
    case_id: str,
    save_result: EvidenceSaveResult,
    uploaded_by_id: Optional[str] = None,
) -> Evidence:
    """
    Creates an evidence DB record from a completed EvidenceSaveResult
    and logs the evidence_uploaded custody event.
    """
    evidence = Evidence(
        case_id=case_id,
        uploaded_by=uploaded_by_id,
        original_filename=save_result.original_filename,
        stored_filename=save_result.stored_filename,
        file_path=save_result.file_path,
        file_type=save_result.file_type,
        mime_type=save_result.mime_type,
        file_size=save_result.file_size,
        sha256_hash=save_result.sha256_hash,
        upload_status="uploaded",
    )

    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    # Custody log — append-only, after commit
    custody_service.log_action(
        db=db,
        case_id=case_id,
        action="evidence_uploaded",
        performed_by_id=uploaded_by_id,
        evidence_id=evidence.id,
        notes=(
            f"File '{save_result.original_filename}' uploaded. "
            f"SHA-256: {save_result.sha256_hash}. "
            f"Size: {round(save_result.file_size / 1024 / 1024, 2)} MB. "
            f"Type: {save_result.file_type}"
        ),
    )

    return evidence


def get_evidence(
    db: Session,
    evidence_id: str,
    current_user: Optional[User] = None,
) -> Evidence:
    """
    Gets evidence by ID.
    Logs an evidence_accessed custody event for auditing.
    """
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    # Log access for auditing
    if current_user:
        custody_service.log_action(
            db=db,
            case_id=evidence.case_id,
            action="evidence_accessed",
            performed_by_id=current_user.id,
            evidence_id=evidence.id,
            notes=f"Evidence '{evidence.original_filename}' accessed by {current_user.email}",
        )

    return evidence


def list_case_evidence(db: Session, case_id: str) -> list[Evidence]:
    """Returns all evidence items for a case, ordered by upload time."""
    return (
        db.query(Evidence)
        .filter(Evidence.case_id == case_id)
        .order_by(Evidence.uploaded_at.asc())
        .all()
    )
