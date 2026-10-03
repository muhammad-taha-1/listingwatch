import { ApiError } from '../api/client'
import { isAdminCancelled } from '../auth/adminToken'

interface Props {
  error: unknown
  /** What failed, e.g. "Could not load check runs". */
  title?: string
  onRetry?: () => void
}

/** An inline error box. Renders nothing for a cancelled admin prompt. */
export default function ErrorMessage({ error, title = 'Something went wrong', onRetry }: Props) {
  if (isAdminCancelled(error)) return null

  const message = error instanceof Error ? error.message : String(error)
  const apiError = error instanceof ApiError ? error : undefined

  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-medium">{title}</p>
      <p className="mt-1">{message}</p>
      {apiError?.status === 0 && (
        <p className="mt-1 text-red-800">
          Is the API running? Start it with <code className="font-mono">cd api && npm run dev</code>.
        </p>
      )}
      {apiError?.requestId && (
        <p className="mt-1 text-xs text-red-700">Request id: {apiError.requestId}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 font-medium hover:bg-red-100"
        >
          Try again
        </button>
      )}
    </div>
  )
}
