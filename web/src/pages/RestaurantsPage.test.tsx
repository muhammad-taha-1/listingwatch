import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiReview, CheckOutcome, CheckResult, RestaurantStatus } from '../api/types'
import AdminTokenProvider from '../auth/AdminTokenProvider'
import RestaurantsPage from './RestaurantsPage'

const checkedAt = '2026-10-01T09:00:00.000Z'

function restaurant(id: string, name: string, city: string, result: CheckOutcome | null): RestaurantStatus {
  return {
    id,
    name,
    city,
    expectedOrderUrl: `https://${id}.example/`,
    description: `${name} serves food in ${city}.`,
    createdAt: checkedAt,
    updatedAt: checkedAt,
    latestCheck: result ? { runId: 'run1', result, statusCode: 200, latencyMs: 30, checkedAt } : null,
    latestReview: null,
  }
}

const restaurants = [
  restaurant('r1', 'Pizza Palace', 'Dublin', 'ok'),
  restaurant('r2', 'Burger Barn', 'Cork', 'broken'),
  restaurant('r3', 'Taco Town', 'Cork', 'ok'),
]

const history: CheckResult[] = [
  { id: 'c1', restaurantId: 'r2', runId: 'run1', result: 'broken', statusCode: 404, latencyMs: 41, error: 'HTTP 404', checkedAt },
]

const review: AiReview = {
  id: 'rev1',
  restaurantId: 'r2',
  reviewedDescription: restaurants[1].description,
  score: 64,
  criteria: {
    clarity: { score: 14, reason: 'Clear enough.' },
    cuisine: { score: 16, reason: 'Says burgers.' },
    location: { score: 12, reason: 'City only.' },
    call_to_action: { score: 8, reason: 'No call to action.' },
    honesty: { score: 14, reason: 'No invented claims.' },
  },
  issues: [{ type: 'call_to_action', detail: 'Tell people how to order.' }],
  suggestedDescription: 'Burger Barn serves burgers in Cork. Order online.',
  model: 'claude-haiku-4-5-20251001',
  inputTokens: 900,
  outputTokens: 300,
  costUsd: 0.0024,
  createdAt: checkedAt,
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

/** A fake API: routes by method + path, like the real one. */
function stubApi() {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const { pathname } = new URL(url)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && pathname === '/restaurants/status') return json({ items: restaurants })
    if (method === 'GET' && pathname === '/restaurants/r2/history') return json({ items: history })
    if (method === 'GET' && pathname === '/restaurants/r2/reviews') return json({ items: [] })
    if (method === 'POST' && pathname === '/restaurants/r2/review') return json(review, 201)
    return json({ error: { code: 'NOT_FOUND', message: `No stub for ${method} ${pathname}` } }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage(path = '/restaurants') {
  // No retries in tests, so error states show at once.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AdminTokenProvider>
          <RestaurantsPage />
        </AdminTokenProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const rowNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RestaurantsPage', () => {
  it('lists restaurants and filters by status and search', async () => {
    stubApi()
    const user = renderPage()

    expect(await screen.findByText('Pizza Palace')).toBeInTheDocument()
    expect(rowNames()).toEqual(['Pizza Palace', 'Burger Barn', 'Taco Town'])

    await user.click(screen.getByRole('button', { name: 'Broken 1' }))
    expect(rowNames()).toEqual(['Burger Barn'])

    await user.click(screen.getByRole('button', { name: 'All 3' }))
    await user.type(screen.getByRole('searchbox'), 'cork')
    expect(rowNames()).toEqual(['Burger Barn', 'Taco Town'])

    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'nowhere')
    expect(screen.getByText(/No restaurants match/)).toBeInTheDocument()
  })

  it('opens the detail panel and runs an AI review with the admin token', async () => {
    const fetchMock = stubApi()
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Burger Barn' }))
    const panel = screen.getByRole('dialog', { name: 'Burger Barn' })
    expect(await within(panel).findByText('HTTP 404 · 41 ms')).toBeInTheDocument()
    expect(await within(panel).findByText(/Not reviewed yet/)).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Review with AI' }))
    await user.type(await screen.findByLabelText('Token'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await within(panel).findByText('Burger Barn serves burgers in Cork. Order online.')).toBeInTheDocument()
    expect(within(panel).getByText('64')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/restaurants/r2/review',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer secret' } }),
    )

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a helpful error with a retry when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const user = renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load restaurants')
    expect(alert).toHaveTextContent('Is the API running?')

    stubApi()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Pizza Palace')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
