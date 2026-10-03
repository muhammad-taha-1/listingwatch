import { describe, expect, it } from 'vitest'
import type { CheckOutcome, RestaurantStatus } from '../api/types'
import { countByStatus, filterRestaurants, isLinkStatus } from './restaurants'

function restaurant(name: string, city: string, result?: CheckOutcome): RestaurantStatus {
  return {
    id: name,
    name,
    city,
    expectedOrderUrl: 'https://example.com/',
    description: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    latestCheck: result
      ? { runId: 'run', result, latencyMs: 10, checkedAt: '2026-10-01T00:00:00.000Z' }
      : null,
    latestReview: null,
  }
}

const items = [
  restaurant('Pizza Palace', 'Dublin', 'ok'),
  restaurant('Burger Barn', 'Cork', 'broken'),
  restaurant('Dublin Diner', 'Galway', 'broken'),
  restaurant('New Place', 'Cork'),
]

const names = (list: RestaurantStatus[]) => list.map((r) => r.name)

describe('filterRestaurants', () => {
  it('returns everything with no filter', () => {
    expect(filterRestaurants(items, {})).toHaveLength(4)
  })

  it('filters by status, treating never-checked as "unchecked"', () => {
    expect(names(filterRestaurants(items, { status: 'broken' }))).toEqual(['Burger Barn', 'Dublin Diner'])
    expect(names(filterRestaurants(items, { status: 'unchecked' }))).toEqual(['New Place'])
  })

  it('searches name and city, ignoring case and surrounding spaces', () => {
    expect(names(filterRestaurants(items, { search: '  DUBLIN ' }))).toEqual(['Pizza Palace', 'Dublin Diner'])
  })

  it('combines status and search', () => {
    expect(names(filterRestaurants(items, { status: 'broken', search: 'cork' }))).toEqual(['Burger Barn'])
  })
})

describe('countByStatus', () => {
  it('counts every status, including zeros', () => {
    expect(countByStatus(items)).toEqual({ ok: 1, broken: 2, wrong_destination: 0, timeout: 0, unchecked: 1 })
  })
})

describe('isLinkStatus', () => {
  it('accepts known statuses only (guards the ?status= URL param)', () => {
    expect(isLinkStatus('wrong_destination')).toBe(true)
    expect(isLinkStatus('nope')).toBe(false)
    expect(isLinkStatus(null)).toBe(false)
  })
})
