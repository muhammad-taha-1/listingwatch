import { useRef, useState, type ChangeEvent } from 'react'
import { useImportCsv } from '../api/queries'
import ErrorMessage from './ErrorMessage'

// Matches the API's express.text() limit for /restaurants/import.
const MAX_BYTES = 1024 * 1024
const MAX_ERRORS_SHOWN = 5

export default function ImportCsv() {
  const input = useRef<HTMLInputElement>(null)
  const importCsv = useImportCsv()
  const [fileError, setFileError] = useState<string | null>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear the input so picking the same file again still fires onChange.
    event.target.value = ''
    if (!file) return

    importCsv.reset()
    setFileError(null)
    if (file.size > MAX_BYTES) {
      setFileError(`${file.name} is larger than 1 MB.`)
      return
    }
    importCsv.mutate(await file.text())
  }

  const result = importCsv.data

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} data-testid="csv-input" />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={importCsv.isPending}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
      >
        {importCsv.isPending ? 'Importing…' : 'Import CSV'}
      </button>

      {fileError && <ErrorMessage error={new Error(fileError)} title="Could not import" />}
      {importCsv.error && <ErrorMessage error={importCsv.error} title="Could not import" />}

      {result && (
        <div role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <p>
              <span className="font-medium">Imported {result.inserted}</span>
              {result.skipped > 0 && `, skipped ${result.skipped} already listed`}
              {result.failed > 0 && `, ${result.failed} row${result.failed === 1 ? '' : 's'} failed`}.
            </p>
            <button type="button" onClick={() => importCsv.reset()} className="text-slate-500 hover:text-slate-900">
              Dismiss
            </button>
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-slate-600">
              {result.errors.slice(0, MAX_ERRORS_SHOWN).map((rowError) => (
                <li key={rowError.line}>
                  Line {rowError.line}: {rowError.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ')}
                </li>
              ))}
              {result.errors.length > MAX_ERRORS_SHOWN && (
                <li>…and {result.errors.length - MAX_ERRORS_SHOWN} more.</li>
              )}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">
            New restaurants show as "Not checked" until the next check run.
          </p>
        </div>
      )}
    </div>
  )
}
