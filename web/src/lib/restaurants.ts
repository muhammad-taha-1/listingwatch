import { CHECK_OUTCOMES, type CheckOutcome, type RestaurantStatus } from '../api/types'
import type { StatusTone } from './statusColors'

/** A restaurant's current link status: its latest check result, or never checked. */
export type LinkStatus = CheckOutcome | 'unchecked'

export const LINK_STATUSES: readonly LinkStatus[] = [...CHECK_OUTCOMES, 'unchecked']

export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  ok: 'OK',
  broken: 'Broken',
  wrong_destination: 'Wrong destination',
  timeout: 'Timed out',
  unchecked: 'Not checked',
}

export const LINK_STATUS_TONE: Record<LinkStatus, StatusTone> = {
  ok: 'good',
  broken: 'critical',
  wrong_destination: 'serious',
  timeout: 'warning',
  unchecked: 'neutral',
}

export function isLinkStatus(value: string | null): value is LinkStatus {
  return value !== null && (LINK_STATUSES as readonly string[]).includes(value)
}

export function linkStatus(restaurant: RestaurantStatus): LinkStatus {
  return restaurant.latestCheck?.result ?? 'unchecked'
}

export interface RestaurantFilter {
  /** undefined means every status. */
  status?: LinkStatus
  /** Matches name or city, ignoring case. */
  search?: string
}

export function filterRestaurants(items: RestaurantStatus[], { status, search }: RestaurantFilter) {
  const needle = search?.trim().toLowerCase() ?? ''
  return items.filter(
    (r) =>
      (!status || linkStatus(r) === status) &&
      (!needle || r.name.toLowerCase().includes(needle) || r.city.toLowerCase().includes(needle)),
  )
}

export function countByStatus(items: RestaurantStatus[]): Record<LinkStatus, number> {
  const counts = Object.fromEntries(LINK_STATUSES.map((s) => [s, 0])) as Record<LinkStatus, number>
  for (const r of items) counts[linkStatus(r)]++
  return counts
}
