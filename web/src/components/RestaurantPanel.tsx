import { useEffect } from 'react'
import type { RestaurantStatus } from '../api/types'
import { linkStatus } from '../lib/restaurants'
import AiReviewCard from './AiReviewCard'
import CheckHistory from './CheckHistory'
import StatusBadge from './StatusBadge'

interface Props {
  /** undefined when the ?id= in the URL matches no restaurant. */
  restaurant: RestaurantStatus | undefined
  onClose: () => void
}

export default function RestaurantPanel({ restaurant, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="panel-title" className="text-lg font-semibold">
              {restaurant?.name ?? 'Restaurant not found'}
            </h2>
            {restaurant && <p className="text-sm text-slate-600">{restaurant.city}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <svg viewBox="0 0 16 16" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {restaurant ? (
            <>
              <section className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={linkStatus(restaurant)} />
                  {restaurant.latestCheck?.result === 'wrong_destination' && restaurant.latestCheck.finalUrl && (
                    <span className="break-all text-slate-600">lands on {restaurant.latestCheck.finalUrl}</span>
                  )}
                </div>
                <p>
                  <span className="text-slate-500">Expected ordering link: </span>
                  <a
                    href={restaurant.expectedOrderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-slate-900 underline hover:no-underline"
                  >
                    {restaurant.expectedOrderUrl}
                  </a>
                </p>
              </section>
              <CheckHistory restaurantId={restaurant.id} expectedUrl={restaurant.expectedOrderUrl} />
              <AiReviewCard restaurant={restaurant} />
            </>
          ) : (
            <p className="text-sm text-slate-600">It may have been deleted. Close this panel to go back to the list.</p>
          )}
        </div>
      </aside>
    </div>
  )
}
