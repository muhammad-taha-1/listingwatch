import { LINK_STATUS_LABEL, LINK_STATUS_TONE, type LinkStatus } from '../lib/restaurants'
import { STATUS_COLOR } from '../lib/statusColors'

// 16px stroke icons, one shape per status so it reads without colour.
const ICON_PATH: Record<LinkStatus, string> = {
  ok: 'M4 8.5l2.5 2.5L12 5.5', // check
  broken: 'M5 5l6 6M11 5l-6 6', // cross
  wrong_destination: 'M5 11l6-6M6.5 5H11v4.5', // arrow away
  timeout: 'M8 4.5V8l2.5 1.5', // clock hands (with the circle below)
  unchecked: 'M5 8h6', // dash
}

export default function StatusBadge({ status }: { status: LinkStatus }) {
  const color = STATUS_COLOR[LINK_STATUS_TONE[status]]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 py-0.5 pr-2.5 pl-1.5 text-xs font-medium text-slate-800">
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {status === 'timeout' && <circle cx="8" cy="8" r="5.5" strokeWidth={1.5} />}
        <path d={ICON_PATH[status]} />
      </svg>
      {LINK_STATUS_LABEL[status]}
    </span>
  )
}
