import { config } from '../config'

/** An error response from the API (or a failure to reach it, status 0). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  /** The API's request id, to find the matching log line. */
  readonly requestId?: string

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { details?: unknown; requestId?: string } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = extra.details
    this.requestId = extra.requestId
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Sent as JSON. */
  json?: unknown
  /** Sent as raw CSV text (POST /restaurants/import). */
  csv?: string
  /** Admin bearer token for write routes. */
  token?: string | null
  signal?: AbortSignal
}

/** The API's error envelope: { error: { code, message, details?, requestId? } }. */
interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown; requestId?: string }
}

/**
 * Call the API and return the parsed JSON body. Throws ApiError for any
 * non-2xx response, so TanStack Query sees it as a failed query.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, csv, token, signal } = options
  const headers: Record<string, string> = {}
  let body: string | undefined

  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (csv !== undefined) {
    headers['Content-Type'] = 'text/csv'
    body = csv
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${config.apiUrl}${path}`, { method, headers, body, signal })
  } catch (err) {
    // Aborts are expected (TanStack Query cancels stale requests); let them through.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK_ERROR', `Could not reach the API at ${config.apiUrl}`)
  }

  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (data as ErrorBody | null)?.error
    throw new ApiError(res.status, error?.code ?? 'HTTP_ERROR', error?.message ?? `HTTP ${res.status}`, {
      details: error?.details,
      requestId: error?.requestId,
    })
  }
  return data as T
}
