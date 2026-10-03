const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

const timeOfDay = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })

export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso))
}

export function formatTime(iso: string): string {
  return timeOfDay.format(new Date(iso))
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** 0.826 -> "83%". */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}
