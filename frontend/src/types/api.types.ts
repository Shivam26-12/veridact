export interface PaginatedResponse<T> {
  items: T[]; total: number; page: number; limit?: number;
  size?: number; pages?: number;
}
export interface ApiError {
  detail: string; error_code?: string; timestamp?: string;
}
export interface ApiResponse<T> {
  data?: T; error?: ApiError; status: number;
}
export interface AnalyticsSummary {
  // Fields returned by GET /api/admin/analytics
  total_incidents: number;
  open_cases: number;
  resolved_cases: number;
  critical_count: number;
  incidents_by_severity: Record<string, number>;
  incidents_by_type: Record<string, number>;
  avg_resolution_hours: number;
  recent_incidents: Array<{
    id: string;
    case_number: string;
    title: string;
    incident_type: string;
    severity: string;
    status: string;
    assigned_to?: string | null;
    response_status?: string;
    created_at: string;
  }>;
}
