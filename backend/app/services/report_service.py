"""Generation of case investigation reports from persisted notes and custody events."""
import hashlib
import os
import re
import uuid
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app import config
from app.models.case import Case
from app.models.custody_log import CustodyLog
from app.models.report import Report


def _pdf_text(value) -> str:
    """Escape content and replace characters unsupported by ReportLab's base font."""
    normalized = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    normalized = normalized.encode("cp1252", "replace").decode("cp1252")
    return escape(normalized).replace("\n", "<br/>")


def _safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", value)


def create_investigation_report(
    db: Session,
    case: Case,
    generated_by_id: str,
    generated_at: datetime | None = None,
    audience: str = "staff",
) -> Report:
    """Build a staff or reporter-safe PDF from case facts and investigation records."""
    if audience not in {"staff", "reporter"}:
        raise ValueError("Report audience must be staff or reporter")
    generated_at = generated_at or datetime.utcnow()
    os.makedirs(config.REPORT_DIR, exist_ok=True)
    report_id = str(uuid.uuid4())
    report_type = "investigation" if audience == "staff" else "public"
    filename = f"{report_type}-{_safe_name(case.case_number)}-{report_id}.pdf"
    file_path = os.path.join(config.REPORT_DIR, filename)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ReportTitle", parent=styles["Title"], alignment=TA_CENTER,
        textColor=colors.HexColor("#12304A"), spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="SectionHeading", parent=styles["Heading2"],
        textColor=colors.HexColor("#12304A"), spaceBefore=10, spaceAfter=5,
    ))
    styles.add(ParagraphStyle(
        name="SmallBody", parent=styles["BodyText"], fontSize=8, leading=11,
    ))

    story = [
        Paragraph(
            "Investigation and Resolution Report" if audience == "staff"
            else "Investigation Outcome Report",
            styles["ReportTitle"],
        ),
        Paragraph(f"Case { _pdf_text(case.case_number) }", styles["Heading2"]),
        Paragraph(
            "This report summarizes recorded case information, staff notes, evidence metadata, "
            "and custody events at the time of generation. It is an operational record, not a "
            "legal finding or independent verification of allegations.",
            styles["BodyText"],
        ),
        Spacer(1, 5 * mm),
        Paragraph("Case Summary", styles["SectionHeading"]),
    ]

    summary_rows = [
        ["Title", _pdf_text(case.title)],
        ["Incident type", _pdf_text(case.incident_type.replace("_", " "))],
        ["Current status", _pdf_text(case.status.replace("_", " "))],
        ["Operational severity", _pdf_text(case.severity)],
        ["Investigation team", _pdf_text(
            (case.assignee.name if case.assignee else "Unassigned")
            if audience == "staff" else "VERIDACT investigation team"
        )],
        ["Submitted", _pdf_text(case.created_at.isoformat() if case.created_at else "Not recorded")],
        ["Report generated", _pdf_text(generated_at.isoformat())],
        ["Affected systems", _pdf_text(case.affected_systems or "Not provided")],
        ["Location", _pdf_text(case.location or "Not provided")],
    ]
    summary_table = Table(summary_rows, colWidths=[42 * mm, 125 * mm], repeatRows=0)
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E8EEF3")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1E2933")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C8D1D9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([summary_table, Paragraph("Original Report", styles["SectionHeading"])])
    story.append(Paragraph(_pdf_text(case.description), styles["BodyText"]))

    if case.triage and audience == "staff":
        story.append(Paragraph("Automated Triage (Advisory)", styles["SectionHeading"]))
        triage_text = (
            f"Status: {case.triage.triage_status}; predicted severity: "
            f"{case.triage.predicted_severity or 'unavailable'}; report-detail score: "
            f"{case.triage.report_detail_score if case.triage.report_detail_score is not None else 'unavailable'}; "
            f"review priority: {case.triage.review_priority or 'manual review'}. "
            f"{case.triage.summary or ''}"
        )
        story.append(Paragraph(_pdf_text(triage_text), styles["BodyText"]))
        story.append(Paragraph(
            "The report-detail score is not a probability that the reporter is truthful.",
            styles["SmallBody"],
        ))

    story.append(Paragraph("Evidence Register", styles["SectionHeading"]))
    evidence_rows = [["File", "Type", "Size (bytes)", "SHA-256"]]
    for evidence in sorted(case.evidence, key=lambda item: item.uploaded_at or generated_at):
        evidence_rows.append([
            _pdf_text(evidence.original_filename),
            _pdf_text(evidence.file_type),
            str(evidence.file_size),
            _pdf_text(evidence.sha256_hash),
        ])
    if len(evidence_rows) == 1:
        evidence_rows.append(["No evidence files recorded", "-", "-", "-"])
    evidence_table = Table(evidence_rows, colWidths=[45 * mm, 25 * mm, 25 * mm, 72 * mm], repeatRows=1)
    evidence_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DCE7EF")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C8D1D9")),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("WORDWRAP", (0, 0), (-1, -1), "CJK"),
    ]))
    story.append(evidence_table)

    story.append(Paragraph("Investigation Notes", styles["SectionHeading"]))
    notes = sorted(
        (note for note in case.notes if audience == "staff" or note.is_public),
        key=lambda item: item.created_at or generated_at,
    )
    if not notes:
        story.append(Paragraph("No investigation notes were recorded.", styles["BodyText"]))
    for note in notes:
        author = note.author.name if note.author else "Staff member"
        visibility = "Reporter-visible" if note.is_public else "Internal"
        story.append(Paragraph(
            f"<b>{_pdf_text(note.created_at.isoformat() if note.created_at else 'Unknown time')} "
            f"- {_pdf_text(author)} - {visibility}</b><br/>{_pdf_text(note.content)}",
            styles["BodyText"],
        ))
        story.append(Spacer(1, 2 * mm))

    story.append(Paragraph("Response and Chain-of-Custody Timeline", styles["SectionHeading"]))
    logs = db.query(CustodyLog).filter(CustodyLog.case_id == case.id).order_by(CustodyLog.timestamp.asc()).all()
    if not logs:
        story.append(Paragraph("No custody events were recorded.", styles["BodyText"]))
    timeline_rows = [["Timestamp", "Actor", "Action and recorded details"]]
    reporter_action_labels = {
        "case_created": "Complaint received and case record created",
        "evidence_uploaded": "Evidence received and integrity hash recorded",
        "investigator_assigned": "Case assigned to the investigation team",
        "case_updated": "Case details or investigation status updated",
        "status_updated": "Response action or case status recorded",
        "resolution_approved": "Investigation outcome reviewed and approved",
        "resolution_returned": "Additional investigation requested during review",
        "case_closed": "Case closed",
        "report_generated": "Investigation report generated",
    }
    for log in logs:
        if audience == "reporter":
            if log.action not in reporter_action_labels:
                continue
            actor = "VERIDACT team"
            detail = reporter_action_labels[log.action]
        else:
            actor = log.performer.name if log.performer else "System/Reporter"
            detail = log.action.replace("_", " ")
            if log.notes:
                detail += ": " + log.notes
        timeline_rows.append([
            _pdf_text(log.timestamp.isoformat() if log.timestamp else "Unknown"),
            _pdf_text(actor),
            _pdf_text(detail),
        ])
    timeline = Table(timeline_rows, colWidths=[37 * mm, 34 * mm, 96 * mm], repeatRows=1)
    timeline.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DCE7EF")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C8D1D9")),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(timeline)

    document = SimpleDocTemplate(
        file_path, pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Investigation Report {case.case_number}",
        author="VERIDACT",
    )
    try:
        document.build(story)
        with open(file_path, "rb") as report_file:
            digest = hashlib.sha256(report_file.read()).hexdigest()
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    report = Report(
        id=report_id,
        case_id=case.id,
        generated_by=generated_by_id,
        report_type=report_type,
        file_path=file_path,
        sha256_hash=digest,
        generated_at=generated_at,
    )
    db.add(report)
    db.flush()
    db.add(CustodyLog(
        case_id=case.id,
        performed_by=generated_by_id,
        action="report_generated",
        notes=f"Investigation report generated; SHA-256: {digest}",
        timestamp=generated_at,
    ))
    return report
