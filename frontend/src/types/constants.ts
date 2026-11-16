export const USER_ROLES = ["super_admin", "supervisor", "investigator", "citizen", "api_partner"] as const;
export type UserRole = typeof USER_ROLES[number];
export const CASE_STATUSES = ["open", "in_progress", "under_review", "resolved", "closed", "referred", "withdrawn"] as const;
export type CaseStatus = typeof CASE_STATUSES[number];
export const INCIDENT_TYPES = [
  "phishing", "ransomware", "data_breach", "ddos", "malware",
  "unauthorized_access", "insider_threat", "social_engineering",
  "web_application_attack", "network_intrusion", "other"
] as const;
export type IncidentType = typeof INCIDENT_TYPES[number];
export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type SeverityLevel = typeof SEVERITY_LEVELS[number];
export const EVIDENCE_TYPES = ["log_file", "screenshot", "network_capture", "document", "email", "other"] as const;
export type EvidenceType = typeof EVIDENCE_TYPES[number];
export const CUSTODY_ACTIONS = [
  "incident_created", "evidence_uploaded", "evidence_accessed",
  "status_updated", "severity_changed", "investigator_assigned",
  "note_added", "report_generated", "case_closed", "file_downloaded"
] as const;
export type CustodyAction = typeof CUSTODY_ACTIONS[number];
export const RESPONSE_ACTIONS = ["contain", "eradicate", "recover", "notify_authority", "escalate", "refer"] as const;
export type ResponseAction = typeof RESPONSE_ACTIONS[number];
export const ALLOWED_EXTENSIONS = {
  log_file: [".log", ".txt", ".csv"],
  screenshot: [".jpg", ".jpeg", ".png", ".bmp", ".webp"],
  network_capture: [".pcap", ".pcapng"],
  document: [".pdf", ".docx", ".xlsx", ".txt"],
  email: [".eml", ".msg"],
  other: [".zip", ".tar", ".gz"],
};
export const MAX_FILE_SIZE_MB = 100;
export const CASE_NUMBER_PREFIX = "INC";

// Legacy aliases for backward compat
export type ComplaintType = IncidentType;
export type PriorityLevel = SeverityLevel;
