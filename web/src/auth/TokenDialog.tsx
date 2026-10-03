import { useState, type FormEvent } from 'react'

interface Props {
  /** Shown when the previous token got a 401. */
  rejected: boolean
  onSubmit: (token: string) => void
  onCancel: () => void
}

export default function TokenDialog({ rejected, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const token = value.trim()
    if (token) onSubmit(token)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // Close only this prompt, not a panel underneath that also listens for Escape.
        event.stopPropagation()
        onCancel()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-dialog-title"
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id="token-dialog-title" className="text-lg font-semibold">
          Admin token
        </h2>
        <p className="text-sm text-slate-600">
          {rejected
            ? 'That token was rejected. Check it and try again.'
            : 'This action changes data. Enter the admin token to continue. It is kept in memory only, until you reload the page.'}
        </p>
        <label className="block text-sm font-medium">
          Token
          <input
            type="password"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal focus:border-slate-500 focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  )
}
