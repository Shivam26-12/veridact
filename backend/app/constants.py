USER_ROLES = ["super_admin", "supervisor", "investigator", "citizen", "api_partner"]
CASE_STATUSES = ["open", "in_progress", "under_review", "resolved", "closed", "referred"]
INCIDENT_TYPES = [
    "phishing", "ransomware", "data_breach", "ddos", "malware",
    "unauthorized_access", "insider_threat", "social_engineering",
    "web_application_attack", "network_intrusion", "other"
]
SEVERITY_LEVELS = ["low", "medium", "high", "critical"]
EVIDENCE_TYPES = ["log_file", "screenshot", "network_capture", "document", "email", "other"]
CUSTODY_ACTIONS = [
    "incident_created", "evidence_uploaded", "evidence_accessed",
    "status_updated", "severity_changed", "investigator_assigned",
    "note_added", "report_generated", "case_closed", "file_downloaded"
]
RESPONSE_ACTIONS = ["contain", "eradicate", "recover", "notify_authority", "escalate", "refer"]
ALLOWED_EXTENSIONS = {
    "log_file": [".log", ".txt", ".csv"],
    "screenshot": [".jpg", ".jpeg", ".png", ".bmp", ".webp"],
    "network_capture": [".pcap", ".pcapng"],
    "document": [".pdf", ".docx", ".xlsx", ".txt"],
    "email": [".eml", ".msg"],
    "other": [".zip", ".tar", ".gz"]
}
MAX_FILE_SIZE_MB = 100
CASE_NUMBER_PREFIX = "INC"
