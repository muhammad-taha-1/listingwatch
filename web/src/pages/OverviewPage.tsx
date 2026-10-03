import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import { useRecentRuns, useRestaurantStatus, useStartRun } from '../api/queries'
import type { CheckRun, RestaurantStatus } from '../api/types'
import ErrorMessage from '../components/ErrorMessage'
import StatCard, { StatCardSkeleton } from '../components/StatCard'
import { formatDateTime, formatPercent, formatRelative } from '../lib/format'
import { activeRun, coverage, coverageSeries, latestCompleted } from '../lib/runs'

// Recharts is most of the bundle and only this chart uses it, so load it in
// its own chunk; the Restaurants page never downloads it.
const CoverageChart = lazy(() => import('../components/CoverageChart'))
const chartPlaceholder = <div className="h-56 animate-pulse rounded bg-slate-100" aria-label="Loading chart" />

export default function OverviewPage() {
  const restaurants = useRestaurantStatus()
  const runs = useRecentRuns()
  const startRun = useStartRun()

  const running = runs.data ? activeRun(runs.data) : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-slate-600">Do restaurants' "Order online" links work and go to the right place?</p>
        </div>
        <button
          type="button"
          onClick={() => startRun.mutate()}
          disabled={startRun.isPending || running !== undefined}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? `Checking ${running.restaurantCount} restaurants…` : startRun.isPending ? 'Starting…' : 'Run check now'}
        </button>
      </div>

      {startRun.error && <ErrorMessage error={startRun.error} title="Could not start a check run" />}

      {restaurants.error && (
        <ErrorMessage error={restaurants.error} title="Could not load restaurants" onRetry={() => void restaurants.refetch()} />
      )}
      {runs.error && (
        <ErrorMessage error={runs.error} title="Could not load check runs" onRetry={() => void runs.refetch()} />
      )}

      {restaurants.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          No restaurants yet.{' '}
          <Link to="/restaurants" className="font-medium text-slate-900 underline">
            Import a CSV
          </Link>{' '}
          to get started.
        </div>
      )}

      <StatCards restaurants={restaurants.data} runs={runs.data} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Ordering coverage, last 14 runs</h2>
        <p className="mb-3 text-sm text-slate-600">Share of restaurants whose ordering link was ok in each completed run.</p>
        <CoverageSection runs={runs.data} isPending={runs.isPending} />
      </section>
    </div>
  )
}

function StatCards({ restaurants, runs }: { restaurants?: RestaurantStatus[]; runs?: CheckRun[] }) {
  const grid = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5'
  if (!restaurants || !runs) {
    return (
      <div className={grid}>
        {Array.from({ length: 5 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const latest = latestCompleted(runs)
  const latestCoverage = latest ? coverage(latest) : null
  const newest = runs[0]
  const neverChecked = restaurants.filter((r) => r.latestCheck === null).length
  const noRun = 'No completed run yet'

  return (
    <div className={grid}>
      <StatCard
        label="Restaurants"
        value={restaurants.length}
        detail={neverChecked > 0 ? `${neverChecked} not checked yet` : 'All checked'}
      />
      <StatCard
        label="Ordering coverage"
        value={latestCoverage === null ? '–' : formatPercent(latestCoverage)}
        detail={latest ? `${latest.totals.ok} of ${latest.restaurantCount} links ok` : noRun}
        tone="good"
      />
      <StatCard
        label="Broken"
        value={latest ? latest.totals.broken : '–'}
        detail={latest ? `plus ${latest.totals.timeout} timed out` : noRun}
        tone="critical"
      />
      <StatCard
        label="Wrong destination"
        value={latest ? latest.totals.wrong_destination : '–'}
        detail={latest ? 'Link works but lands elsewhere' : noRun}
        tone="serious"
      />
      <StatCard
        label="Last run"
        value={newest ? (newest.status === 'running' ? 'Running' : formatRelative(newest.startedAt)) : 'Never'}
        detail={
          newest
            ? `${newest.trigger === 'schedule' ? 'Scheduled' : 'Manual'}${newest.status === 'failed' ? ', failed' : ''} · ${formatDateTime(newest.startedAt)}`
            : 'Click "Run check now"'
        }
      />
    </div>
  )
}

function CoverageSection({ runs, isPending }: { runs?: CheckRun[]; isPending: boolean }) {
  if (isPending) return chartPlaceholder
  if (!runs) return null

  const points = coverageSeries(runs)
  if (points.length === 0) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-slate-500">
        No completed runs yet. Click "Run check now" to start one.
      </p>
    )
  }
  return (
    <Suspense fallback={chartPlaceholder}>
      <CoverageChart points={points} />
    </Suspense>
  )
}
