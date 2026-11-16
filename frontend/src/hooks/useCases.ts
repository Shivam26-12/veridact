// ============================================================
// useCases — Fetches paginated case list from live backend API
// ============================================================
import { useState, useEffect } from 'react'
import type { Case, PaginatedResponse } from '@/types'
import { caseService } from '@/services/caseService'

export interface UseCasesOptions {
  status?: string
  incident_type?: string
  severity?: string
  search?: string
  page?: number
  size?: number
}

export function useCases(options: UseCasesOptions = {}) {
  const [data, setData] = useState<PaginatedResponse<Case> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchCases = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await caseService.getCases({
          status: options.status || undefined,
          incident_type: options.incident_type || undefined,
          severity: options.severity || undefined,
          search: options.search || undefined,
          page: options.page ?? 1,
          size: options.size ?? 20,
        })
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setError('Failed to load incidents')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchCases()
    return () => { cancelled = true }
  }, [options.status, options.incident_type, options.severity, options.search, options.page, options.size])

  return { data, isLoading, error }
}
