import type { FocusEventHandler, MouseEventHandler } from 'react'

const warmed = new Set<string>()
const inflight = new Map<string, Promise<void>>()

function isValidMlsId(id: string | null | undefined): id is string {
  const trimmed = id?.trim()
  return Boolean(trimmed && trimmed !== '—')
}

/** Fire-and-forget: fetch listing from RETS if needed and upsert into SQLite. */
export function warmListingCache(mlsId: string | null | undefined): void {
  if (!isValidMlsId(mlsId)) return
  const id = mlsId.trim()
  if (warmed.has(id) || inflight.has(id)) return

  const request = fetch(`/api/listings/${encodeURIComponent(id)}/cache`, {
    method: 'POST',
    keepalive: true,
  })
    .then((res) => {
      if (res.ok) warmed.add(id)
    })
    .catch(() => {})
    .finally(() => {
      inflight.delete(id)
    })

  inflight.set(id, request)
}

type HoverHandlerProps = {
  onMouseEnter?: MouseEventHandler<HTMLElement>
  onFocus?: FocusEventHandler<HTMLElement>
}

/** Spread onto cards, rows, or links to cache a listing on hover/focus. */
export function listingHoverHandlers(
  mlsId: string | null | undefined,
  handlers: HoverHandlerProps = {},
): HoverHandlerProps {
  return {
    onMouseEnter: (event) => {
      warmListingCache(mlsId)
      handlers.onMouseEnter?.(event)
    },
    onFocus: (event) => {
      warmListingCache(mlsId)
      handlers.onFocus?.(event)
    },
  }
}
