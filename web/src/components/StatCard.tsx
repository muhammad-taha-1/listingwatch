import type { ReactNode } from 'react'
import { STATUS_COLOR, type StatusTone } from '../lib/statusColors'

interface Props {
  label: string
  value: ReactNode
  /** One line of context under the value. */
  detail?: ReactNode
  /** A status dot next to the label; the label text carries the meaning too. */
  tone?: StatusTone
}

export default function StatCard({ label, value, detail, tone }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm text-slate-600">
        {tone && (
          <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[tone] }} />
        )}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-slate-200" />
      <div className="mt-2 h-7 w-16 rounded bg-slate-200" />
    </div>
  )
}
