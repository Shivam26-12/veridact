"""Cloudinary evidence storage tests."""
import base64
import asyncio
import io
from types import SimpleNamespace

import cloudinary
import pytest
from cloudinary import uploader
from starlette.datastructures import UploadFile

from app import config
from app.models.evidence import Evidence
from app.services import evidence_service


_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII="
)


def test_image_upload_uses_authenticated_cloudinary_asset(monkeypatch):
    calls = {}
    monkeypatch.setattr(config, "CLOUDINARY_URL", "cloudinary://key:secret@cloud")
    monkeypatch.setattr(cloudinary, "config", lambda **kwargs: calls.update(config=kwargs))

    def upload(data, **options):
        calls.update(data=data, upload_options=options)
        return {"public_id": options["public_id"], "secure_url": "https://cloudinary.test/private.png"}

    monkeypatch.setattr(uploader, "upload", upload)
    file = UploadFile(filename="evidence.png", file=io.BytesIO(_PNG_BYTES))

    result = asyncio.run(evidence_service.save_upload_file(file, "case-123"))

    assert result.file_path.startswith("cloudinary://image/authenticated/")
    assert result.stored_filename in result.file_path
    assert result.file_size == len(_PNG_BYTES)
    assert result.sha256_hash
    assert calls["upload_options"]["type"] == "authenticated"
    assert calls["upload_options"]["resource_type"] == "image"


def test_cloudinary_evidence_gets_expiring_private_download_url(monkeypatch):
    calls = {}
    monkeypatch.setattr(config, "CLOUDINARY_URL", "cloudinary://key:secret@cloud")
    monkeypatch.setattr(config, "CLOUDINARY_URL_EXPIRY_SECONDS", 900)
    monkeypatch.setattr(cloudinary, "config", lambda **kwargs: None)

    def private_download_url(public_id, file_format, **options):
        calls.update(public_id=public_id, file_format=file_format, options=options)
        return "https://cloudinary.test/private-download"

    monkeypatch.setattr("cloudinary.utils.private_download_url", private_download_url)
    evidence = SimpleNamespace(
        file_path="cloudinary://image/authenticated/case-evidence-id",
        mime_type="image/jpeg",
    )

    url = evidence_service.get_file_url(evidence)

    assert url == "https://cloudinary.test/private-download"
    assert calls["public_id"] == "case-evidence-id"
    assert calls["file_format"] == "jpg"
    assert calls["options"]["type"] == "authenticated"
    assert calls["options"]["expires_at"] > 0


def test_non_cloudinary_evidence_has_no_remote_url():
    evidence = SimpleNamespace(file_path="uploads/evidence/photo.png")

    assert evidence_service.get_file_url(evidence) is None


def test_case_detail_only_returns_private_image_url_to_staff(
    client, case_factory, users, admin_headers, investigator_headers, citizen_headers, db_session, monkeypatch
):
    case = case_factory(assignee=users["inv1"])
    db_session.add(Evidence(
        case_id=case.id,
        original_filename="evidence.png",
        stored_filename="private-image-id",
        file_path="cloudinary://image/authenticated/private-image-id",
        file_type="screenshot",
        mime_type="image/png",
        file_size=len(_PNG_BYTES),
        sha256_hash="a" * 64,
    ))
    db_session.commit()
    monkeypatch.setattr("app.routes.cases.get_file_url", lambda _: "https://private.example/image")

    admin_data = client.get(f"/api/cases/{case.id}", headers=admin_headers).json()
    investigator_data = client.get(
        f"/api/cases/{case.id}", headers=investigator_headers
    ).json()
    citizen_data = client.get(f"/api/cases/{case.id}", headers=citizen_headers).json()

    assert admin_data["evidence"][0]["file_url"] == "https://private.example/image"
    assert investigator_data["evidence"][0]["file_url"] == "https://private.example/image"
    assert citizen_data["evidence"][0]["file_url"] is None


def test_staff_can_preview_local_image_and_unassigned_investigator_is_denied(
    client,
    case_factory,
    users,
    investigator_headers,
    investigator2_headers,
    db_session,
    monkeypatch,
    tmp_path,
):
    case = case_factory(assignee=users["inv1"])
    evidence_dir = tmp_path / "uploads" / "evidence"
    evidence_dir.mkdir(parents=True)
    image_path = evidence_dir / "evidence.png"
    image_path.write_bytes(_PNG_BYTES)
    monkeypatch.setattr(config, "UPLOAD_DIR", str(tmp_path / "uploads"))
    evidence = Evidence(
        case_id=case.id,
        original_filename="evidence.png",
        stored_filename="evidence.png",
        file_path=str(image_path),
        file_type="screenshot",
        mime_type="image/png",
        file_size=len(_PNG_BYTES),
        sha256_hash="b" * 64,
    )
    db_session.add(evidence)
    db_session.commit()

    preview = client.get(
        f"/api/evidence/{evidence.id}/file", headers=investigator_headers
    )
    denied = client.get(
        f"/api/evidence/{evidence.id}/file", headers=investigator2_headers
    )

    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"
    assert "inline" in preview.headers["content-disposition"]
    assert preview.content == _PNG_BYTES
    assert denied.status_code == 403
