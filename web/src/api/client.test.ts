import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './client'

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('returns the parsed JSON body on success', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { items: [1, 2] }))
    await expect(apiFetch('/restaurants/status')).resolves.toEqual({ items: [1, 2] })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/restaurants/status',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('sends JSON, CSV and the admin token with the right headers', async () => {
    const fetchMock = stubFetch(jsonResponse(201, {}))
    await apiFetch('/restaurants', { method: 'POST', json: { name: 'x' }, token: 'secret' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: '{"name":"x"}',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      }),
    )

    const csvFetch = stubFetch(jsonResponse(200, {}))
    await apiFetch('/restaurants/import', { method: 'POST', csv: 'name,city' })
    expect(csvFetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ body: 'name,city', headers: { 'Content-Type': 'text/csv' } }),
    )
  })

  it("turns the API's error envelope into an ApiError", async () => {
    stubFetch(
      jsonResponse(404, {
        error: { code: 'NOT_FOUND', message: 'Restaurant not found', requestId: 'req-1' },
      }),
    )
    const err = await apiFetch('/restaurants/abc').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Restaurant not found',
      requestId: 'req-1',
    })
  })

  it('falls back to a generic error when the body is not the envelope', async () => {
    stubFetch(new Response('Bad Gateway', { status: 502 }))
    await expect(apiFetch('/health')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: 'HTTP 502',
    })
  })

  it('reports an unreachable API as a NETWORK_ERROR with status 0', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    await expect(apiFetch('/health')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('returns undefined for 204 No Content', async () => {
    stubFetch(new Response(null, { status: 204 }))
    await expect(apiFetch('/restaurants/abc', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
