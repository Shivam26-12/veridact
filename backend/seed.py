"""
VERIDACT — Database Seeder
Cybersecurity Incident Reporting and Management System.
Drops/creates tables and seeds initial demo users, cases, evidence, and custody logs.
Run with: python seed.py --reset (fresh) or python seed.py (idempotent)
"""
import sys
import uuid
import hashlib
from datetime import datetime, timedelta

from app.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.case import Case
from app.models.evidence import Evidence
from app.models.custody_log import CustodyLog
from app.models.case_note import CaseNote
from app.services.auth_service import get_password_hash


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _sha256(seed_str: str) -> str:
    """Deterministic 64-char hex SHA-256 from a seed string."""
    return hashlib.sha256(seed_str.encode()).hexdigest()


def _past(days: int, hours: int = 0) -> datetime:
    return datetime.utcnow() - timedelta(days=days, hours=hours)


# ─── Main ─────────────────────────────────────────────────────────────────────

def seed_database(reset: bool = False):
    print("=" * 60)
    print("VERIDACT DATABASE SEEDER — Cybersecurity Incident System")
    print("=" * 60)

    if reset:
        print("[*] Reset flag detected. Dropping all tables...")
        Base.metadata.drop_all(bind=engine)
        print("[*] Recreating all tables...")
        Base.metadata.create_all(bind=engine)
    else:
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_users(db)
        seed_cases(db)
        print_summary(db)
    finally:
        db.close()


# ─── Users ────────────────────────────────────────────────────────────────────

def seed_users(db):
    if db.query(User).count() > 0:
        print("[*] Users already seeded — skipping.")
        return

    print("[*] Seeding demo users...")
    hashed_pwd = get_password_hash("demo1234")

    users_to_create = [
        User(id="usr-admin-001",  email="admin@veridact.com",      name="System Administrator",     role="super_admin",  password_hash=hashed_pwd, organization="Security Operations Center"),
        User(id="usr-super-001",  email="supervisor@veridact.com",  name="Priya Sharma",             role="supervisor",   password_hash=hashed_pwd, organization="Security Operations Center"),
        User(id="usr-inv-001",    email="inv1@veridact.com",        name="Officer Ram Shrestha",     role="investigator", password_hash=hashed_pwd, organization="Security Operations Center"),
        User(id="usr-inv-002",    email="inv2@veridact.com",        name="Officer Sita Rai",         role="investigator", password_hash=hashed_pwd, organization="Security Operations Center"),
        User(id="usr-citizen-001",email="citizen1@veridact.com",    name="Arjun Thapa",              role="citizen",      password_hash=hashed_pwd, organization=None),
        User(id="usr-citizen-002",email="citizen2@veridact.com",    name="Nisha Gurung",             role="citizen",      password_hash=hashed_pwd, organization=None),
    ]

    db.add_all(users_to_create)
    db.commit()
    print(f"[*] Created {len(users_to_create)} demo users.")


# ─── Cases + Evidence + Custody ───────────────────────────────────────────────

def seed_cases(db):
    if db.query(Case).count() > 0:
        print("[*] Cases already seeded — skipping.")
        return

    print("[*] Seeding 5 demo cybersecurity incidents...")

    INV1 = "usr-inv-001"
    INV2 = "usr-inv-002"
    CIT1 = "usr-citizen-001"
    CIT2 = "usr-citizen-002"

    # ── Case 1: Phishing ──────────────────────────────────────────────────────
    c1_id = "case-demo-001"
    c1 = Case(
        id=c1_id,
        case_number="INC-2025-000001",
        title="Phishing Campaign Targeting Finance Department",
        description=(
            "Multiple employees received spoofed emails impersonating the CFO requesting "
            "urgent wire transfers to external accounts. 3 users clicked the embedded link. "
            "Credential harvesting page was live for 4 hours before takedown."
        ),
        incident_type="phishing",
        status="in_progress",
        severity="high",
        submitted_by=CIT1,
        assigned_to=INV1,
        contact_email="citizen1@veridact.com",
        contact_phone="+977-9841000001",
        location="Finance Department — HQ",
        affected_systems="Email Server, Finance Workstations (3 hosts)",
        response_status="containment_in_progress",
        created_at=_past(12),
        updated_at=_past(10),
    )
    db.add(c1)
    db.commit()

    e1a_id = str(uuid.uuid4())
    e1a = Evidence(
        id=e1a_id, case_id=c1_id, uploaded_by=CIT1,
        original_filename="phishing_email_headers.eml",
        stored_filename=f"{e1a_id}.eml",
        file_path=f"../uploads/evidence/{e1a_id}.eml",
        file_type="document", mime_type="message/rfc822", file_size=18_432,
        sha256_hash=_sha256("demo-evidence-case1-email"),
        upload_status="uploaded", uploaded_at=_past(12, 1),
    )
    e1b_id = str(uuid.uuid4())
    e1b = Evidence(
        id=e1b_id, case_id=c1_id, uploaded_by=INV1,
        original_filename="harvesting_page_screenshot.png",
        stored_filename=f"{e1b_id}.png",
        file_path=f"../uploads/evidence/{e1b_id}.png",
        file_type="image", mime_type="image/png", file_size=1_024_000,
        sha256_hash=_sha256("demo-evidence-case1-screenshot"),
        upload_status="uploaded", uploaded_at=_past(11),
    )
    db.add_all([e1a, e1b])
    db.commit()

    db.add(CaseNote(
        id=str(uuid.uuid4()), case_id=c1_id, author_id=INV1,
        content="Incident received and assigned. Phishing URL has been sinkholed. Affected users are being interviewed.",
        is_public=True, created_at=_past(10),
    ))
    db.add(CaseNote(
        id=str(uuid.uuid4()), case_id=c1_id, author_id=INV1,
        content="Internal: Sender IP traces to Eastern European hosting. 3 credential sets compromised. Force password reset + MFA enrollment.",
        is_public=False, created_at=_past(10, 2),
    ))
    db.commit()

    _log(db, c1_id, "incident_created",    CIT1,  None,   _past(12),    "Incident INC-2025-000001 created. Type: phishing")
    _log(db, c1_id, "evidence_uploaded",   CIT1,  e1a_id, _past(12, 1), f"File 'phishing_email_headers.eml' uploaded. SHA-256: {_sha256('demo-evidence-case1-email')}")
    _log(db, c1_id, "evidence_uploaded",   INV1,  e1b_id, _past(11),    f"File 'harvesting_page_screenshot.png' uploaded. SHA-256: {_sha256('demo-evidence-case1-screenshot')}")
    _log(db, c1_id, "investigator_assigned", INV1, None,  _past(10),    "Incident assigned to Officer Ram Shrestha")
    _log(db, c1_id, "status_updated",      INV1,  None,   _past(10),    "Status: open -> in_progress. Containment actions initiated.")

    # ── Case 2: Ransomware ────────────────────────────────────────────────────
    c2_id = "case-demo-002"
    c2 = Case(
        id=c2_id,
        case_number="INC-2025-000002",
        title="Ransomware Infection — File Server FS-01",
        description=(
            "File server FS-01 was found encrypted by LockBit 3.0 ransomware. Ransom note "
            "found on desktop demanding 2 BTC. Server was immediately isolated from the network. "
            "Backup integrity check is in progress."
        ),
        incident_type="ransomware",
        status="under_review",
        severity="critical",
        submitted_by=CIT2,
        assigned_to=INV1,
        contact_email="citizen2@veridact.com",
        contact_phone="+977-9841000002",
        location="Data Center — Rack B, Floor 2",
        affected_systems="File Server FS-01, Backup Server BS-02",
        response_status="contained",
        created_at=_past(20),
        updated_at=_past(5),
    )
    db.add(c2)
    db.commit()

    e2a_id = str(uuid.uuid4())
    e2a = Evidence(
        id=e2a_id, case_id=c2_id, uploaded_by=CIT2,
        original_filename="ransom_note.txt",
        stored_filename=f"{e2a_id}.txt",
        file_path=f"../uploads/evidence/{e2a_id}.txt",
        file_type="document", mime_type="text/plain", file_size=2_048,
        sha256_hash=_sha256("demo-evidence-case2-txt"),
        upload_status="uploaded", uploaded_at=_past(20, 1),
    )
    db.add(e2a)
    db.commit()

    _log(db, c2_id, "incident_created",    CIT2,  None,   _past(20),    "Incident INC-2025-000002 created. Type: ransomware")
    _log(db, c2_id, "evidence_uploaded",   CIT2,  e2a_id, _past(20, 1), f"File 'ransom_note.txt' uploaded. SHA-256: {_sha256('demo-evidence-case2-txt')}")
    _log(db, c2_id, "investigator_assigned", INV1, None,  _past(18),    "Incident assigned to Officer Ram Shrestha")
    _log(db, c2_id, "status_updated",      INV1,  None,   _past(18),    "Status: open -> in_progress. FS-01 network-isolated.")
    _log(db, c2_id, "status_updated",      INV1,  None,   _past(5),     "Status: in_progress -> under_review. Backup integrity verified.")

    # ── Case 3: Data Breach ───────────────────────────────────────────────────
    c3_id = "case-demo-003"
    c3 = Case(
        id=c3_id,
        case_number="INC-2025-000003",
        title="Unauthorized Access to Customer PII Database",
        description=(
            "Database monitoring alerts detected anomalous bulk SELECT queries on the customer "
            "PII table at 02:14 UTC. Approx. 15,000 records accessed. Source IP is external. "
            "API Gateway logs show a valid but revoked service account token was used."
        ),
        incident_type="data_breach",
        status="open",
        severity="critical",
        submitted_by=None,
        assigned_to=None,
        contact_email=None,
        contact_phone="+977-9856000003",
        location="Cloud Infrastructure — AWS us-east-1",
        affected_systems="Customer DB (PostgreSQL), API Gateway",
        response_status="pending_response",
        created_at=_past(3),
        updated_at=_past(3),
    )
    db.add(c3)
    db.commit()

    e3a_id = str(uuid.uuid4())
    e3a = Evidence(
        id=e3a_id, case_id=c3_id, uploaded_by=None,
        original_filename="db_access_logs_2025_05_21.log",
        stored_filename=f"{e3a_id}.log",
        file_path=f"../uploads/evidence/{e3a_id}.log",
        file_type="document", mime_type="text/plain", file_size=3_145_728,
        sha256_hash=_sha256("demo-evidence-case3-log"),
        upload_status="uploaded", uploaded_at=_past(3, 1),
    )
    db.add(e3a)
    db.commit()

    _log(db, c3_id, "incident_created",  None, None,   _past(3),    "Incident INC-2025-000003 created. Type: data_breach")
    _log(db, c3_id, "evidence_uploaded", None, e3a_id, _past(3, 1), f"File 'db_access_logs_2025_05_21.log' uploaded. SHA-256: {_sha256('demo-evidence-case3-log')}")

    # ── Case 4: DDoS ──────────────────────────────────────────────────────────
    c4_id = "case-demo-004"
    c4 = Case(
        id=c4_id,
        case_number="INC-2025-000004",
        title="DDoS Attack on Public Web Portal — 4-Hour Outage",
        description=(
            "Sustained volumetric DDoS attack caused 4 hours of service disruption on the main "
            "citizen services portal. Peak traffic: 450 Gbps. CDN rate-limiting and upstream "
            "null-routing were applied. Attributed to Mirai botnet variant."
        ),
        incident_type="ddos",
        status="resolved",
        severity="high",
        submitted_by=CIT1,
        assigned_to=INV2,
        contact_email="citizen1@veridact.com",
        contact_phone="+977-9841000001",
        location="Public Web Portal — CDN Edge",
        affected_systems="Web Portal, Load Balancers (3), CDN Edge Nodes",
        response_status="recovered",
        created_at=_past(30),
        updated_at=_past(2),
    )
    db.add(c4)
    db.commit()

    e4a_id = str(uuid.uuid4())
    e4a = Evidence(
        id=e4a_id, case_id=c4_id, uploaded_by=CIT1,
        original_filename="traffic_capture_ddos.pcap",
        stored_filename=f"{e4a_id}.pcap",
        file_path=f"../uploads/evidence/{e4a_id}.pcap",
        file_type="document", mime_type="application/vnd.tcpdump.pcap", file_size=52_428_800,
        sha256_hash=_sha256("demo-evidence-case4-pcap"),
        upload_status="uploaded", uploaded_at=_past(30, 1),
    )
    e4b_id = str(uuid.uuid4())
    e4b = Evidence(
        id=e4b_id, case_id=c4_id, uploaded_by=INV2,
        original_filename="cdn_access_logs_attack_window.log",
        stored_filename=f"{e4b_id}.log",
        file_path=f"../uploads/evidence/{e4b_id}.log",
        file_type="document", mime_type="text/plain", file_size=10_485_760,
        sha256_hash=_sha256("demo-evidence-case4-logs"),
        upload_status="uploaded", uploaded_at=_past(28),
    )
    db.add_all([e4a, e4b])
    db.commit()

    _log(db, c4_id, "incident_created",    CIT1,  None,   _past(30),    "Incident INC-2025-000004 created. Type: ddos")
    _log(db, c4_id, "evidence_uploaded",   CIT1,  e4a_id, _past(30, 1), f"File 'traffic_capture_ddos.pcap' uploaded. SHA-256: {_sha256('demo-evidence-case4-pcap')}")
    _log(db, c4_id, "evidence_uploaded",   INV2,  e4b_id, _past(28),    f"File 'cdn_access_logs.log' uploaded. SHA-256: {_sha256('demo-evidence-case4-logs')}")
    _log(db, c4_id, "investigator_assigned", INV2, None,  _past(25),    "Incident assigned to Officer Sita Rai")
    _log(db, c4_id, "status_updated",      INV2,  None,   _past(24),    "Status: in_progress -> under_review. Null-route applied.")
    _log(db, c4_id, "status_updated",      INV2,  None,   _past(2),     "Status: under_review -> resolved. Services fully restored.")
    _log(db, c4_id, "report_generated",    INV2,  None,   _past(2),     "Incident report generated and archived.")

    # ── Case 5: Malware ───────────────────────────────────────────────────────
    c5_id = "case-demo-005"
    c5 = Case(
        id=c5_id,
        case_number="INC-2025-000005",
        title="Keylogger Malware Detected on HR Workstations",
        description=(
            "Endpoint detection flagged keylogger activity on 3 HR workstations. "
            "Initial analysis suggests the malware was delivered via a USB drive labelled "
            "'Q1 Payroll'. HR credentials and sensitive employee data may be at risk."
        ),
        incident_type="malware",
        status="open",
        severity="medium",
        submitted_by=None,
        assigned_to=None,
        contact_email=None,
        contact_phone="+977-9825000005",
        location="HR Department — Floor 3",
        affected_systems="HR-WS-01, HR-WS-02, HR-WS-03",
        response_status="pending_response",
        created_at=_past(1),
        updated_at=_past(1),
    )
    db.add(c5)
    db.commit()

    e5a_id = str(uuid.uuid4())
    e5a = Evidence(
        id=e5a_id, case_id=c5_id, uploaded_by=None,
        original_filename="edr_malware_alert_report.pdf",
        stored_filename=f"{e5a_id}.pdf",
        file_path=f"../uploads/evidence/{e5a_id}.pdf",
        file_type="document", mime_type="application/pdf", file_size=1_048_576,
        sha256_hash=_sha256("demo-evidence-case5-pdf"),
        upload_status="uploaded", uploaded_at=_past(1, 2),
    )
    db.add(e5a)
    db.commit()

    _log(db, c5_id, "incident_created",  None, None,   _past(1),    "Incident INC-2025-000005 created. Type: malware")
    _log(db, c5_id, "evidence_uploaded", None, e5a_id, _past(1, 2), f"File 'edr_malware_alert_report.pdf' uploaded. SHA-256: {_sha256('demo-evidence-case5-pdf')}")

    print("[*] Successfully seeded 5 cybersecurity incidents, 8 evidence records, 2 case notes.")


def _log(db, case_id, action, performed_by_id, evidence_id, ts, notes):
    """Helper to insert a custody log with a specific timestamp."""
    entry = CustodyLog(
        id=str(uuid.uuid4()),
        case_id=case_id,
        action=action,
        performed_by=performed_by_id,
        evidence_id=evidence_id,
        notes=notes,
        timestamp=ts,
    )
    db.add(entry)
    db.commit()


# ─── Summary ──────────────────────────────────────────────────────────────────

def print_summary(db):
    print()
    print("-" * 60)
    print("DEMO CREDENTIALS (Password for all: demo1234)")
    print("-" * 60)
    print(f"{'Role':<15} | {'Email':<30} | Name")
    print("-" * 60)
    for u in db.query(User).order_by(User.role.desc()).all():
        print(f"{u.role:<15} | {u.email:<30} | {u.name}")
    print("-" * 60)
    print()
    print(f"Incidents:  {db.query(Case).count()}")
    print(f"Evidence:   {db.query(Evidence).count()}")
    print(f"Audit Logs: {db.query(CustodyLog).count()}")
    print(f"Notes:      {db.query(CaseNote).count()}")
    print("-" * 60)
    print("Seed complete.")


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    reset = "--reset" in sys.argv
    seed_database(reset=reset)
