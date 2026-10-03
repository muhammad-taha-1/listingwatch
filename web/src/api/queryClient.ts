import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data changes only when a check run or review happens, and those
        // invalidate their queries, so a short stale window is plenty.
        staleTime: 30_000,
        // Retry network blips and 5xx, but not 4xx: asking again won't fix a bad request.
        retry: (failureCount, error) =>
          failureCount < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  })
}
