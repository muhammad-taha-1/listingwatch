import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import { AdminCancelledError, AdminTokenContext, type AdminTokenContextValue } from './adminToken'
import TokenDialog from './TokenDialog'

interface Waiting {
  promise: Promise<string>
  resolve: (token: string) => void
  reject: (err: Error) => void
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401
}

/**
 * Holds the admin token in memory only (no localStorage), so it is gone on
 * reload and never readable by other tabs or scripts after the page closes.
 */
export default function AdminTokenProvider({ children }: { children: ReactNode }) {
  // A ref, so async callers always read the current token rather than the one
  // from the render they were created in. State only drives re-renders.
  const tokenRef = useRef<string | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [prompt, setPrompt] = useState<{ rejected: boolean } | null>(null)
  // The open prompt's promise, shared by every request waiting for a token.
  const waiting = useRef<Waiting | null>(null)

  const setToken = useCallback((token: string | null) => {
    tokenRef.current = token
    setHasToken(token !== null)
  }, [])

  const askForToken = useCallback((rejected: boolean): Promise<string> => {
    if (!waiting.current) {
      let resolve!: (token: string) => void
      let reject!: (err: Error) => void
      const promise = new Promise<string>((res, rej) => {
        resolve = res
        reject = rej
      })
      waiting.current = { promise, resolve, reject }
      setPrompt({ rejected })
    }
    return waiting.current.promise
  }, [])

  const closePrompt = useCallback(
    (token: string | null) => {
      const current = waiting.current
      waiting.current = null
      setPrompt(null)
      if (token) {
        setToken(token)
        current?.resolve(token)
      } else {
        current?.reject(new AdminCancelledError())
      }
    },
    [setToken],
  )

  const runAsAdmin = useCallback(
    async <T,>(request: (token: string) => Promise<T>): Promise<T> => {
      const first = tokenRef.current ?? (await askForToken(false))
      try {
        return await request(first)
      } catch (err) {
        if (!isUnauthorized(err)) throw err
        // Forget it unless another request already replaced it with a new one.
        if (tokenRef.current === first) setToken(null)
      }

      const second = tokenRef.current ?? (await askForToken(true))
      try {
        return await request(second)
      } catch (err) {
        if (isUnauthorized(err) && tokenRef.current === second) setToken(null)
        throw err
      }
    },
    [askForToken, setToken],
  )

  const value = useMemo<AdminTokenContextValue>(
    () => ({ hasToken, runAsAdmin, forgetToken: () => setToken(null) }),
    [hasToken, runAsAdmin, setToken],
  )

  return (
    <AdminTokenContext value={value}>
      {children}
      {prompt && (
        <TokenDialog
          rejected={prompt.rejected}
          onSubmit={(token) => closePrompt(token)}
          onCancel={() => closePrompt(null)}
        />
      )}
    </AdminTokenContext>
  )
}
