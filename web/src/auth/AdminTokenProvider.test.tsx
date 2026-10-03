import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { useAdminToken } from './adminToken'
import AdminTokenProvider from './AdminTokenProvider'

type Request = (token: string) => Promise<string>

/** A button that runs `request` as admin and shows the outcome. */
function Harness({ request }: { request: Request }) {
  const { runAsAdmin, hasToken } = useAdminToken()
  return (
    <>
      <button
        type="button"
        onClick={() => {
          runAsAdmin(request).then(
            (result) => document.body.setAttribute('data-result', result),
            (err: Error) => document.body.setAttribute('data-result', `error:${err.name}`),
          )
        }}
      >
        Write
      </button>
      <span>{hasToken ? 'has token' : 'no token'}</span>
    </>
  )
}

function setup(request: Request) {
  document.body.removeAttribute('data-result')
  render(
    <AdminTokenProvider>
      <Harness request={request} />
    </AdminTokenProvider>,
  )
  return userEvent.setup()
}

async function enterToken(user: ReturnType<typeof userEvent.setup>, token: string) {
  await user.type(await screen.findByLabelText('Token'), token)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid admin token')

describe('AdminTokenProvider', () => {
  it('asks for the token once, then reuses it for later writes', async () => {
    const request = vi.fn<Request>().mockResolvedValue('done')
    const user = setup(request)

    await user.click(screen.getByRole('button', { name: 'Write' }))
    await enterToken(user, 'secret')
    await vi.waitFor(() => expect(document.body.dataset.result).toBe('done'))
    expect(request).toHaveBeenCalledWith('secret')
    expect(screen.getByText('has token')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Write' }))
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(request).toHaveBeenLastCalledWith('secret')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('on a 401 forgets the token, asks again and retries with the new one', async () => {
    const request = vi.fn<Request>().mockRejectedValueOnce(unauthorized()).mockResolvedValue('done')
    const user = setup(request)

    await user.click(screen.getByRole('button', { name: 'Write' }))
    await enterToken(user, 'wrong')
    expect(await screen.findByText(/That token was rejected/)).toBeInTheDocument()
    expect(screen.getByText('no token')).toBeInTheDocument()

    await enterToken(user, 'right')
    await vi.waitFor(() => expect(document.body.dataset.result).toBe('done'))
    expect(request.mock.calls).toEqual([['wrong'], ['right']])
  })

  it('gives up after a second 401 and reports the error', async () => {
    const request = vi.fn<Request>().mockRejectedValue(unauthorized())
    const user = setup(request)

    await user.click(screen.getByRole('button', { name: 'Write' }))
    await enterToken(user, 'wrong')
    await enterToken(user, 'still-wrong')
    await vi.waitFor(() => expect(document.body.dataset.result).toBe('error:ApiError'))
    expect(request).toHaveBeenCalledTimes(2)
    expect(screen.getByText('no token')).toBeInTheDocument()
  })

  it('rejects with AdminCancelledError when the prompt is cancelled', async () => {
    const request = vi.fn<Request>()
    const user = setup(request)

    await user.click(screen.getByRole('button', { name: 'Write' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(document.body.dataset.result).toBe('error:AdminCancelledError'))
    expect(request).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not retry errors other than 401', async () => {
    const request = vi
      .fn<Request>()
      .mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong'))
    const user = setup(request)

    await user.click(screen.getByRole('button', { name: 'Write' }))
    await enterToken(user, 'secret')
    await vi.waitFor(() => expect(document.body.dataset.result).toBe('error:ApiError'))
    expect(request).toHaveBeenCalledTimes(1)
    // A server error says nothing about the token, so it is kept.
    expect(screen.getByText('has token')).toBeInTheDocument()
  })
})
