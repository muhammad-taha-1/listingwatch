import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAdminToken } from '../auth/adminToken'
import { activeRun } from '../lib/runs'
import { apiFetch } from './client'
import type { CheckRun, Items, RestaurantStatus, RunStatus } from './types'

// Hierarchical keys: invalidating ['restaurants'] refreshes every query under it
// (status list, each restaurant's history and reviews).
export const queryKeys = {
  restaurants: ['restaurants'] as const,
  restaurantStatus: ['restaurants', 'status'] as const,
  runs: ['checks', 'runs'] as const,
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
