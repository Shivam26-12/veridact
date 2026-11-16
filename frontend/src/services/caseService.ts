// ============================================================
// caseService — Case management API calls
// ============================================================
import apiClient from './apiClient'
import type { Case, CaseDetail, CreateCasePayload, UpdateCasePayload, PaginatedResponse } from '@/types'

export interface CaseFilters {
  status?: string
  incident_type?: string
  severity?: string
  assigned_to?: string
  search?: string
  page?: number
  size?: number
  limit?: number
}

export const caseService = {
  async getCases(filters: CaseFilters = {}): Promise<PaginatedResponse<Case>> {
    const { size, limit, ...rest } = filters
    const params = {
      ...rest,
      limit: limit ?? size ?? 20,
    }
    const response = await apiClient.get<PaginatedResponse<Case>>('/cases', { params })
    return response.data
  },

  async getCase(caseId: string): Promise<CaseDetail> {
    const response = await apiClient.get<CaseDetail>(`/cases/${caseId}`)
    return response.data
  },

  async createCase(payload: CreateCasePayload): Promise<Case> {
    const response = await apiClient.post<Case>('/cases', payload)
    return response.data
  },

  /** Creates a case without authentication — for public citizen submissions on /submit */
  async createCaseAnonymous(payload: CreateCasePayload): Promise<Case> {
    const response = await apiClient.post<Case>('/cases/anonymous', payload)
    return response.data
  },

  async updateCase(caseId: string, payload: UpdateCasePayload): Promise<Case> {
    const response = await apiClient.patch<Case>(`/cases/${caseId}`, payload)
    return response.data
  },

  async reviewCase(caseId: string, decision: 'approve' | 'return', reason?: string): Promise<Case> {
    const response = await apiClient.post<Case>(`/cases/${caseId}/review`, { decision, reason })
    return response.data
  },

  async retryTriage(caseId: string): Promise<Case> {
    const response = await apiClient.post<Case>(`/cases/${caseId}/triage`)
    return response.data
  },

  async generateReport(caseId: string): Promise<{ report_id: string; message: string }> {
    const response = await apiClient.post(`/cases/${caseId}/report`)
    return response.data
  },

  async downloadReport(reportId: string): Promise<Blob> {
    const response = await apiClient.get<Blob>(`/reports/${reportId}`, { responseType: 'blob' })
    return response.data
  },

  async listCaseReports(caseId: string): Promise<{ items: Array<{ id: string; report_type: string; generated_at: string; sha256_hash: string }> }> {
    const response = await apiClient.get(`/cases/${caseId}/reports`)
    return response.data
  },

  async getPublicCaseStatus(caseNumber: string) {
    const response = await apiClient.get(`/public/cases/${caseNumber}`)
    return response.data
  },

  async getTimeline(caseId: string) {
    const response = await apiClient.get<Array<{
      id: string
      action: string
      performed_by_id?: string
      performer_name?: string
      notes?: string
      ip_address?: string
      timestamp?: string
    }>>(`/incidents/${caseId}/timeline`)
    return response.data
  },

  async logResponseAction(caseId: string, action: string, notes?: string) {
    const response = await apiClient.post<{
      message: string
      case_id: string
      status: string
      response_status: string
      custody_log_id?: string
    }>(`/incidents/${caseId}/response`, { action, notes })
    return response.data
  },
}
