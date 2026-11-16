/**
 * VERIDACT — Public Service
 * Handles citizen-facing public API calls (no auth required).
 */
import apiClient from './apiClient';

function reporterHeaders(accessToken?: string) {
  const token = localStorage.getItem('veridact_token')
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(accessToken ? { 'X-Case-Access-Token': accessToken } : {}),
  }
}

/**
 * Track a case by its public case number.
 */
export const trackCase = async (caseNumber: string, accessToken?: string) => {
  const response = await apiClient.get(`/public/cases/${caseNumber}`, {
    headers: accessToken ? { 'X-Case-Access-Token': accessToken } : undefined,
  });
  return response.data;
};

export const submitReporterDecision = async (
  caseNumber: string,
  accessToken: string,
  action: 'accept' | 'request_changes' | 'withdraw',
  reason?: string,
) => {
  const response = await apiClient.post(
    `/public/cases/${caseNumber}/decision`,
    { action, reason },
    { headers: reporterHeaders(accessToken) },
  )
  return response.data
}

export const downloadInvestigationReport = async (caseNumber: string, accessToken: string): Promise<Blob> => {
  const response = await apiClient.get(`/public/cases/${caseNumber}/investigation-report`, {
    headers: reporterHeaders(accessToken),
    responseType: 'blob',
  })
  return response.data
}

export default { trackCase, submitReporterDecision, downloadInvestigationReport };
