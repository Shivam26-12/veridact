// ============================================================
// evidenceService — Evidence upload and retrieval API calls
// ============================================================
import apiClient from './apiClient'
import type { Evidence } from '@/types'

export const evidenceService = {
  async uploadEvidence(caseId: string, file: File, onProgress?: (pct: number) => void): Promise<Evidence> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<Evidence>(`/cases/${caseId}/evidence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
    return response.data
  },

  async getEvidence(evidenceId: string): Promise<Evidence> {
    const response = await apiClient.get<Evidence>(`/evidence/${evidenceId}`)
    return response.data
  },
}
