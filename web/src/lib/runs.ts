import type { CheckRun } from '../api/types'

/** A run still "running" after this long most likely died mid-way; stop waiting for it. */
export const STALE_RUN_MS = 10 * 60_000

/** Share of checked restaurants whose ordering link is ok (0-1), or null if not applicable. */
export function coverage(run: CheckRun): number | null {
  if (run.status !== 'completed' || run.restaurantCount === 0) return null
  return run.totals.ok / run.restaurantCount
}

/** The newest completed run. `runs` is newest first, as the API returns it. */
export function latestCompleted(runs: CheckRun[]): CheckRun | undefined {
  return runs.find((run) => run.status === 'completed')
}

/** A run that is in progress right now (ignores ones stuck in "running"). */
export function activeRun(runs: CheckRun[], now = Date.now()): CheckRun | undefined {
  return runs.find((run) => run.status === 'running' && now - Date.parse(run.startedAt) < STALE_RUN_MS)
}

export interface CoveragePoint {
  runId: string
  startedAt: string
  /** 0-100, for the chart's percentage axis. */
  coverage: number
  ok: number
  checked: number
}

/** Chart points for completed runs, oldest first so time runs left to right. */
export function coverageSeries(runs: CheckRun[]): CoveragePoint[] {
  return runs
    .flatMap((run) => {
      const ratio = coverage(run)
      return ratio === null
        ? []
        : [
            {
              runId: run.id,
              startedAt: run.startedAt,
              coverage: Math.round(ratio * 1000) / 10,
              ok: run.totals.ok,
              checked: run.restaurantCount,
            },
          ]
    })
    .reverse()
}
