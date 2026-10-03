import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useRestaurantStatus } from '../api/queries'
import type { RestaurantStatus } from '../api/types'
import ErrorMessage from '../components/ErrorMessage'
import ImportCsv from '../components/ImportCsv'
import RestaurantPanel from '../components/RestaurantPanel'
import StatusBadge from '../components/StatusBadge'
import { formatDateTime, formatRelative } from '../lib/format'
import {
  LINK_STATUSES,
  LINK_STATUS_LABEL,
  countByStatus,
  filterRestaurants,
  isLinkStatus,
  linkStatus,
} from '../lib/restaurants'

export default function RestaurantsPage() {
  const restaurants = useRestaurantStatus()
  // Filter and search live in the URL, so a filtered view survives reloads and can be shared.
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const status = isLinkStatus(statusParam) ? statusParam : undefined
  const search = params.get('q') ?? ''
  const selectedId = params.get('id')

  // `replace` by default: typing in the search box shouldn't add a history
  // entry per keystroke. Opening a panel does push one, so Back closes it.
  const setParam = useCallback(
    (key: string, value: string | undefined, { replace = true } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace },
      )
    },
    [setParams],
  )
  const closePanel = useCallback(() => setParam('id', undefined), [setParam])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Restaurants</h1>
          <p className="text-sm text-slate-600">Each restaurant's latest link check and AI review score.</p>
        </div>
        <ImportCsv />
      </div>

      {restaurants.error && (
        <ErrorMessage error={restaurants.error} title="Could not load restaurants" onRetry={() => void restaurants.refetch()} />
      )}

      {restaurants.isPending && <TableSkeleton />}

      {restaurants.data &&
        (restaurants.data.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            No restaurants yet. Import a CSV with the columns{' '}
            <code className="font-mono">name,city,expectedOrderUrl,description</code>.
          </div>
        ) : (
          <>
            <Filters
              items={restaurants.data}
              status={status}
              search={search}
              onStatus={(value) => setParam('status', value)}
              onSearch={(value) => setParam('q', value)}
            />
            <RestaurantTable
              items={filterRestaurants(restaurants.data, { status, search })}
              selectedId={selectedId}
              onSelect={(id) => setParam('id', id, { replace: false })}
              onClear={() => setParams({}, { replace: true })}
            />
          </>
        ))}

      {selectedId && restaurants.data && (
        <RestaurantPanel
          // A new key per restaurant resets the panel's state (e.g. a pending review).
          key={selectedId}
          restaurant={restaurants.data.find((r) => r.id === selectedId)}
          onClose={closePanel}
        />
      )}
    </div>
  )
}

interface FiltersProps {
  items: RestaurantStatus[]
  status?: string
  search: string
  onStatus: (status: string | undefined) => void
  onSearch: (search: string) => void
}

function Filters({ items, status, search, onStatus, onSearch }: FiltersProps) {
  const counts = countByStatus(items)
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${
      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
    }`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Search name or city"
        aria-label="Search restaurants by name or city"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm sm:w-64"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by link status">
        <button type="button" aria-pressed={!status} onClick={() => onStatus(undefined)} className={chip(!status)}>
          All {items.length}
        </button>
        {LINK_STATUSES.filter((s) => counts[s] > 0 || s === status).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => onStatus(s)} className={chip(status === s)}>
            {LINK_STATUS_LABEL[s]} {counts[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

interface TableProps {
  items: RestaurantStatus[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
}

function RestaurantTable({ items, selectedId, onSelect, onClear }: TableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        No restaurants match.{' '}
        <button type="button" onClick={onClear} className="font-medium text-slate-900 underline">
          Clear filters
        </button>
      </div>
    )
  }

  return (
    // Scrolls inside the card on narrow screens instead of widening the page.
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">City</th>
            <th className="px-4 py-2 font-medium">Link status</th>
            <th className="px-4 py-2 font-medium">Last checked</th>
            <th className="px-4 py-2 text-right font-medium">AI score</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                r.id === selectedId ? 'bg-slate-100' : ''
              }`}
            >
              <td className="px-4 py-2 font-medium">
                {/* The row is clickable with a mouse; this button makes it reachable by keyboard. */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation() // the row's onClick would select it a second time
                    onSelect(r.id)
                  }}
                  className="text-left hover:underline"
                >
                  {r.name}
                </button>
              </td>
              <td className="px-4 py-2 text-slate-600">{r.city}</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={linkStatus(r)} />
                  {r.latestCheck?.error && <span className="text-xs text-slate-500">{r.latestCheck.error}</span>}
                </div>
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                {r.latestCheck ? (
                  <time dateTime={r.latestCheck.checkedAt} title={formatDateTime(r.latestCheck.checkedAt)}>
                    {formatRelative(r.latestCheck.checkedAt)}
                  </time>
                ) : (
                  'Never'
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.latestReview ? r.latestReview.score : <span className="text-slate-400">–</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-lg border border-slate-200 bg-white p-4" aria-label="Loading restaurants">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-6 rounded bg-slate-100" />
      ))}
    </div>
  )
}
