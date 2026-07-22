/**
 * Browser-side prefetch cache for listing/spotlight tab API payloads.
 *
 * Server warm (`/api/listings/.../warm`) fills Postgres. This module fills the
 * *browser* so the next tab can render from memory instead of waiting on a new
 * network round-trip after navigation.
 */

type PendingEntry = {
  status: 'pending'
  promise: Promise<unknown>
}

type OkEntry = {
  status: 'ok'
  data: unknown
}

type ErrEntry = {
  status: 'error'
}

type CacheEntry = PendingEntry | OkEntry | ErrEntry

const cache = new Map<string, CacheEntry>()

/** Start fetching `url` into the session cache (no-op if already started). */
export function prefetchTabJson(url: string): void {
  const key = url.trim()
  if (!key || cache.has(key)) return

  const promise = fetch(key, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<unknown>
    })
    .then((data) => {
      cache.set(key, { status: 'ok', data })
      return data
    })
    .catch(() => {
      cache.set(key, { status: 'error' })
      return null
    })

  cache.set(key, { status: 'pending', promise })
}

/** Drop a cached URL so the next load/prefetch hits the network. */
export function invalidateTabJson(url: string): void {
  const key = url.trim()
  if (key) cache.delete(key)
}

/** Sync read — returns data only if the prefetch already finished successfully. */
export function peekTabJson<T>(url: string): T | undefined {
  const entry = cache.get(url.trim())
  if (entry?.status === 'ok') return entry.data as T
  return undefined
}

/** Async read — awaits an in-flight prefetch or fetches now. */
export async function loadTabJson<T>(
  url: string,
  options?: { force?: boolean },
): Promise<T | null> {
  const key = url.trim()
  if (!key) return null

  if (options?.force) cache.delete(key)

  const existing = cache.get(key)
  if (existing?.status === 'ok') return existing.data as T
  if (existing?.status === 'pending') {
    const data = await existing.promise
    return (data as T) ?? null
  }
  if (existing?.status === 'error') {
    // Allow a single retry after a prior failure.
    cache.delete(key)
  }

  prefetchTabJson(key)
  const entry = cache.get(key)
  if (entry?.status === 'pending') {
    const data = await entry.promise
    return (data as T) ?? null
  }
  if (entry?.status === 'ok') return entry.data as T
  return null
}

/** Canonical listing chrome URL (scores + listing, no photo URL resolution). */
export function listingChromeApiUrl(mlsId: string): string {
  return `/api/listings/${encodeURIComponent(mlsId.trim())}?photos=0`
}

export type PrefetchListingTabsOptions = {
  mlsId: string
  routeBase?: 'listing' | 'spotlight'
  /** Spotlight `?property=` value (omit for tab 1). */
  propertyParam?: string | null
  townHint?: string | null
}

/**
 * Kick off every tab’s API payload in parallel. Safe to call repeatedly —
 * requests are deduped for the life of the page session.
 */
export function prefetchListingTabApis(
  options: PrefetchListingTabsOptions,
): void {
  const mlsId = options.mlsId?.trim()
  if (!mlsId) return

  const routeBase = options.routeBase ?? 'listing'
  const propertyParam = options.propertyParam?.trim() || null
  const town = options.townHint?.trim() || null

  if (routeBase === 'spotlight') {
    const propertyQs = propertyParam
      ? `&property=${encodeURIComponent(propertyParam)}`
      : ''
    prefetchTabJson(`/api/spotlight?photos=0${propertyQs}`)

    const saleParams = new URLSearchParams()
    if (propertyParam) saleParams.set('property', propertyParam)
    const saleQs = saleParams.toString()
    prefetchTabJson(
      saleQs
        ? `/api/spotlight/comparables?${saleQs}`
        : '/api/spotlight/comparables',
    )

    const rentalParams = new URLSearchParams({ kind: 'rental' })
    if (propertyParam) rentalParams.set('property', propertyParam)
    prefetchTabJson(`/api/spotlight/comparables?${rentalParams.toString()}`)

    const uagParams = new URLSearchParams()
    if (propertyParam) uagParams.set('property', propertyParam)
    const uagQs = uagParams.toString()
    prefetchTabJson(
      uagQs ? `/api/spotlight/uag?${uagQs}` : '/api/spotlight/uag',
    )
  } else {
    // Match ListingDetailClient / tab chrome — skip photo URL resolution.
    prefetchTabJson(listingChromeApiUrl(mlsId))
    prefetchTabJson(`/api/listings/${encodeURIComponent(mlsId)}/comparables`)
    prefetchTabJson(
      `/api/listings/${encodeURIComponent(mlsId)}/comparables?kind=rental`,
    )
    prefetchTabJson(`/api/listings/${encodeURIComponent(mlsId)}/uag`)
    prefetchTabJson(`/api/listings/${encodeURIComponent(mlsId)}/if`)
  }

  // History is listing-API backed for both surfaces today.
  const historyParams = new URLSearchParams()
  if (town) historyParams.set('town', town)
  const historyQs = historyParams.toString()
  prefetchTabJson(
    `/api/listings/${encodeURIComponent(mlsId)}/history${
      historyQs ? `?${historyQs}` : ''
    }`,
  )
}
