import { createContext, useContext } from 'react'

/** Thrown by runAsAdmin when the user closes the token prompt; not a real failure. */
export class AdminCancelledError extends Error {
  constructor() {
    super('Admin token prompt was cancelled')
    this.name = 'AdminCancelledError'
  }
}

export function isAdminCancelled(err: unknown): boolean {
  return err instanceof AdminCancelledError
}

export interface AdminTokenContextValue {
  hasToken: boolean
  /**
   * Run a write request with the admin token: asks for the token if there is
   * none, and on a 401 forgets it, asks again and retries once.
   */
  runAsAdmin: <T>(request: (token: string) => Promise<T>) => Promise<T>
  forgetToken: () => void
}

export const AdminTokenContext = createContext<AdminTokenContextValue | null>(null)

export function useAdminToken(): AdminTokenContextValue {
  const value = useContext(AdminTokenContext)
  if (!value) throw new Error('useAdminToken must be used inside <AdminTokenProvider>')
  return value
}
