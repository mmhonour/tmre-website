import 'server-only'

import { getSyncMeta } from '@/lib/db/sync-meta'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  countStreetParcelsMissingListings,
  listStreetParcelsMissingListings,
} from '@/lib/db/vision-streets-repo'
import { isRetsConfigured } from '@/lib/rets'
import { ingestStreetListingIfMissing } from '@/lib/street-listing-ingest'

export const STREET_LISTINGS_SYNCED_AT_KEY = 'street_listings_synced_at'

/** How long a finished chunk keeps the Railway sweep from re-enqueueing leftover work. */
export const STREET_LISTINGS_CATCH_UP_STALE_MS = 6 * 60 * 60 * 1000

export const STREET_LISTINGS_CHUNK = 40

export type StreetListingsSyncResult = {
  ok: boolean
  startedAt: string
  finishedAt: string
  durationMs: number
  attempted: number
  ingested: number
  linked: number
  missing: number
  remaining: number
  detail: string
  error?: string
}

export async function streetListingsHaveWork(): Promise<boolean> {
  return (await countStreetParcelsMissingListings()) > 0
}

export async function streetListingsNeedCatchUp(
  now = Date.now(),
): Promise<boolean> {
  if (!(await streetListingsHaveWork())) return false
  const last = await getSyncMeta(STREET_LISTINGS_SYNCED_AT_KEY)
  const lastMs = last ? Date.parse(last) : Number.NaN
  if (!Number.isFinite(lastMs)) return true
  return now - lastMs >= STREET_LISTINGS_CATCH_UP_STALE_MS
}

export async function syncStreetListings(options?: {
  limit?: number
}): Promise<StreetListingsSyncResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const limit = Math.max(
    1,
    Math.min(options?.limit ?? STREET_LISTINGS_CHUNK, 80),
  )

  if (!isRetsConfigured()) {
    const finishedAt = new Date().toISOString()
    return {
      ok: false,
      startedAt,
      finishedAt,
      durationMs: Date.now() - t0,
      attempted: 0,
      ingested: 0,
      linked: 0,
      missing: 0,
      remaining: await countStreetParcelsMissingListings().catch(() => 0),
      detail: 'RETS is not configured',
      error: 'RETS is not configured',
    }
  }

  const parcels = await listStreetParcelsMissingListings(limit)
  let ingested = 0
  let linked = 0
  let missing = 0
  for (const parcel of parcels) {
    const result = await ingestStreetListingIfMissing(
      parcel.town,
      parcel.visionPid,
      { writeProgress: false },
    )
    if (result.listing && result.ingested) ingested += 1
    else if (result.listing) linked += 1
    else missing += 1
  }

  const remaining = await countStreetParcelsMissingListings()
  const finishedAt = new Date().toISOString()
  await setSyncMetaDurable(STREET_LISTINGS_SYNCED_AT_KEY, finishedAt)

  const detail = [
    `${parcels.length} street address${parcels.length === 1 ? '' : 'es'} checked`,
    ingested ? `${ingested} pulled from RETS` : null,
    linked ? `${linked} already in listings` : null,
    missing ? `${missing} not in RETS` : null,
    remaining > 0 ? `${remaining.toLocaleString()} still unlinked` : 'queue empty',
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    ok: true,
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    attempted: parcels.length,
    ingested,
    linked,
    missing,
    remaining,
    detail,
  }
}
