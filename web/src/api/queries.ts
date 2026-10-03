import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAdminToken } from '../auth/adminToken'
import { activeRun } from '../lib/runs'
import { apiFetch } from './client'
import type { AiReview, CheckResult, CheckRun, ImportResult, Items, RestaurantStatus, RunStatus } from './types'

// Hierarchical keys: invalidating ['restaurants'] refreshes every query under it
// (status list, each restaurant's history and reviews).
export const queryKeys = {
  restaurants: ['restaurants'] as const,
  restaurantStatus: ['restaurants', 'status'] as const,
  runs: ['checks', 'runs'] as const,
  history: (id: string) => ['restaurants', id, 'history'] as const,
  latestReview: (id: string) => ['restaurants', id, 'latestReview'] as const,
}

const HISTORY_LIMIT = 10

/** One restaurant's recent link checks, newest first. */
export function useRestaurantHistory(id: string) {
  return useQuery({
    queryKey: queryKeys.history(id),
    queryFn: ({ signal }) =>
      apiFetch<Items<CheckResult>>(`/restaurants/${id}/history?limit=${HISTORY_LIMIT}`, { signal }).then(
        (body) => body.items,
      ),
  })
}

/** The newest AI review, or null if the restaurant has never been reviewed. */
export function useLatestReview(id: string) {
  return useQuery({
    queryKey: queryKeys.latestReview(id),
    queryFn: ({ signal }) =>
      apiFetch<Items<AiReview>>(`/restaurants/${id}/reviews?limit=1`, { signal }).then((body) => body.items[0] ?? null),
  })
}

/** Paid call (one LLM request). The response is the new review, so put it straight into the cache. */
export function useReviewRestaurant(id: string) {
  const { runAsAdmin } = useAdminToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      runAsAdmin((token) => apiFetch<AiReview>(`/restaurants/${id}/review`, { method: 'POST', token })),
    onSuccess: (review) => {
      queryClient.setQueryData(queryKeys.latestReview(id), review)
      // The table's AI score column comes from the status list.
      return queryClient.invalidateQueries({ queryKey: queryKeys.restaurantStatus })
    },
  })
}

const RUN_POLL_MS = 2_000

export function useRestaurantStatus() {
  return useQuery({
    queryKey: queryKeys.restaurantStatus,
    queryFn: ({ signal }) =>
      apiFetch<Items<RestaurantStatus>>('/restaurants/status', { signal }).then((body) => body.items),
  })
}

/**
 * The last 14 runs, newest first. While one is running, refetch every 2s
 * (this also picks up scheduled runs); when it finishes, refresh restaurant
 * data so tables show the new results.
 */
export function useRecentRuns() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.runs,
    queryFn: ({ signal }) => apiFetch<Items<CheckRun>>('/checks/runs?limit=14', { signal }).then((body) => body.items),
    refetchInterval: (q) => (q.state.data && activeRun(q.state.data) ? RUN_POLL_MS : false),
  })

  const runningId = query.data ? activeRun(query.data)?.id : undefined
  const previousRunningId = useRef(runningId)
  useEffect(() => {
    if (previousRunningId.current && !runningId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants })
    }
    previousRunningId.current = runningId
  }, [runningId, queryClient])

  return query
}

/** Upload a CSV file's text; new restaurants appear in the table as "Not checked". */
export function useImportCsv() {
  const { runAsAdmin } = useAdminToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (csv: string) =>
      runAsAdmin((token) => apiFetch<ImportResult>('/restaurants/import', { method: 'POST', csv, token })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.restaurants }),
  })
}

/** POST /checks/run returns 202 at once; the run itself is tracked by useRecentRuns. */
export function useStartRun() {
  const { runAsAdmin } = useAdminToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      runAsAdmin((token) =>
        apiFetch<{ runId: string; status: RunStatus }>('/checks/run', { method: 'POST', token }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
  })
}
