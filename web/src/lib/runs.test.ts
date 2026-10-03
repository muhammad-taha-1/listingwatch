import { describe, expect, it } from 'vitest'
import type { CheckRun } from '../api/types'
import { STALE_RUN_MS, activeRun, coverage, coverageSeries, latestCompleted } from './runs'

function run(overrides: Partial<CheckRun> & { id: string }): CheckRun {
  return {
    startedAt: '2026-10-01T09:00:00.000Z',
    finishedAt: '2026-10-01T09:00:14.000Z',
    trigger: 'manual',
    status: 'completed',
    restaurantCount: 30,
    totals: { ok: 24, broken: 3, wrong_destination: 2, timeout: 1, crashed: 0 },
    ...overrides,
  }
}

describe('coverage', () => {
  it('is ok / restaurants checked for a completed run', () => {
    expect(coverage(run({ id: 'a' }))).toBe(0.8)
  })

  it('is null for runs that are not completed or checked nothing', () => {
    expect(coverage(run({ id: 'a', status: 'running' }))).toBeNull()
    expect(coverage(run({ id: 'b', status: 'failed' }))).toBeNull()
    expect(coverage(run({ id: 'c', restaurantCount: 0 }))).toBeNull()
  })
})

describe('coverageSeries', () => {
  it('keeps completed runs only, oldest first, as percentages', () => {
    const runs = [
      run({ id: 'newest', status: 'running' }),
      run({ id: 'middle', totals: { ok: 20, broken: 10, wrong_destination: 0, timeout: 0, crashed: 0 } }),
      run({ id: 'oldest', restaurantCount: 3, totals: { ok: 2, broken: 1, wrong_destination: 0, timeout: 0, crashed: 0 } }),
    ]
    expect(coverageSeries(runs)).toEqual([
      expect.objectContaining({ runId: 'oldest', coverage: 66.7, ok: 2, checked: 3 }),
      expect.objectContaining({ runId: 'middle', coverage: 66.7, ok: 20, checked: 30 }),
    ])
  })
})

describe('latestCompleted / activeRun', () => {
  const now = Date.parse('2026-10-01T10:00:00.000Z')

  it('finds the newest completed run', () => {
    const runs = [run({ id: 'r', status: 'running' }), run({ id: 'c1' }), run({ id: 'c2' })]
    expect(latestCompleted(runs)?.id).toBe('c1')
  })

  it('treats a recent running run as active and an old one as stale', () => {
    const recent = new Date(now - 30_000).toISOString()
    const stale = new Date(now - STALE_RUN_MS - 1).toISOString()
    expect(activeRun([run({ id: 'r', status: 'running', startedAt: recent })], now)?.id).toBe('r')
    expect(activeRun([run({ id: 'r', status: 'running', startedAt: stale })], now)).toBeUndefined()
    expect(activeRun([run({ id: 'c' })], now)).toBeUndefined()
  })
})
