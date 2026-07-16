import type { FocusEventHandler, MouseEventHandler } from 'react'
import {
  prefetchListingTabApis,
  type PrefetchListingTabsOptions,
} from '@/lib/tab-data-prefetch'

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

const warmedTabs = new Set<string>()
const inflightTabs = new Map<string, Promise<void>>()

/**
 * Fire-and-forget: warm all listing-detail tab data.
 *
 * 1) Browser prefetch of every tab API JSON (instant paint on next tab)
 * 2) Server POST `/warm` so Postgres caches are hot if the browser cache misses
 *
 * Dedupes per mlsId for the life of the page session.
 */
export function warmListingTabs(
  mlsId: string | null | undefined,
  options?: Omit<PrefetchListingTabsOptions, 'mlsId'>,
): void {
  if (!isValidMlsId(mlsId)) return
  const id = mlsId.trim()

  // Always (re)kick browser prefetch — cheap if already cached.
  prefetchListingTabApis({
    mlsId: id,
    routeBase: options?.routeBase,
    propertyParam: options?.propertyParam,
    townHint: options?.townHint,
  })

  if (warmedTabs.has(id) || inflightTabs.has(id)) return

  const request = fetch(`/api/listings/${encodeURIComponent(id)}/warm`, {
    method: 'POST',
    keepalive: true,
  })
    .then((res) => {
      if (res.ok) warmedTabs.add(id)
    })
    .catch(() => {})
    .finally(() => {
      inflightTabs.delete(id)
    })

  inflightTabs.set(id, request)
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
