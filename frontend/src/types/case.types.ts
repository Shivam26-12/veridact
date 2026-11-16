import { IncidentType, SeverityLevel, CaseStatus } from './constants';
import { Evidence } from './evidence.types';

export interface Case {
  id: string; case_number: string; title: string; description: string;
  incident_type: IncidentType | string; severity: SeverityLevel | string; status: CaseStatus | string;
  contact_email?: string | null; contact_phone?: string | null;
  location?: string | null; submitted_by?: string | null;
  assigned_to?: string | null; created_at: string; updated_at: string;
  assigned_to_name?: string | null;
  evidence_count?: number;
  affected_systems?: string | null;
  response_status?: string | null;
  triage_status?: 'pending' | 'complete' | 'unavailable' | null;
  predicted_severity?: SeverityLevel | null;
  report_detail_score?: number | null;
  review_priority?: 'urgent' | 'standard' | 'low' | null;
  triage_summary?: string | null;
  reporter_access_token?: string | null;
}

export interface CaseDetail extends Case {
  evidence: Evidence[]; notes: CaseNote[];
}

export interface CaseNote {
  id: string; case_id: string; author_id: string; content: string;
  is_public: boolean; created_at: string; author_name?: string | null;
}

export interface CreateCasePayload {
  title: string;
  description: string;
  incident_type: IncidentType;
  contact_email?: string;
  contact_phone?: string;
  location?: string;
  affected_systems?: string;
}

export interface UpdateCasePayload {
  status?: CaseStatus;
  severity?: SeverityLevel;
  assigned_to?: string;
  title?: string;
  description?: string;
  note?: string;
  note_is_public?: boolean;
}

export interface PublicCaseStatus {
  case_number: string;
  status: CaseStatus;
  incident_type: IncidentType;
  submitted_at: string;
  last_updated: string;
  public_notes: string[];
}
