import 'server-only'

import { listingRowId, readAllListingsFromDb } from '@/lib/db/listings-repo'
import { readLocationEstimateRow } from '@/lib/db/listing-location-estimates-repo'
import { cacheLocationEstimateForListing } from '@/lib/listing-location-estimates-resolve'
import { LOCATION_ESTIMATE_ALGO_VERSION } from '@/lib/listing-location-estimates'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

/**
 * Slow overnight backfill of location estimates (coastal areas / town centers).
 * One town Closed pool at a time; small pause between listings. Not a town
 * market-stats rebuild. A later estimates sync job can claim this work and
 * keep writing snapshots for the time series.
 */

const DEFAULT_LIMIT = 40
const DEFAULT_PAUSE_MS = 1_500
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export type LocationEstimateOvernightResult = {
  considered: number
  written: number
  skippedFresh: number
  towns: TmreTown[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isFresh(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return Date.now() - t < REFRESH_AFTER_MS
}

export async function runLocationEstimateOvernight(options?: {
  limit?: number
  pauseMs?: number
}): Promise<LocationEstimateOvernightResult> {
  const limit = Math.max(1, options?.limit ?? DEFAULT_LIMIT)
  const pauseMs = Math.max(0, options?.pauseMs ?? DEFAULT_PAUSE_MS)
  let considered = 0
  let written = 0
  let skippedFresh = 0
  const townsTouched: TmreTown[] = []

  for (const town of TMRE_TOWNS) {
    if (written >= limit) break
    const soldPool = await readAllListingsFromDb([town], 'Closed')
    const activePool = await readAllListingsFromDb([town], 'Active')
    let townWrote = false

    for (const subject of activePool) {
      if (written >= limit) break
      const id = listingRowId(subject)
      if (!id) continue
      considered += 1
      const existing = await readLocationEstimateRow(id).catch(() => null)
      if (
        existing &&
        existing.algoVersion === LOCATION_ESTIMATE_ALGO_VERSION &&
        isFresh(existing.computedAt)
      ) {
        skippedFresh += 1
        continue
      }
      await cacheLocationEstimateForListing(subject, soldPool)
      written += 1
      townWrote = true
      if (pauseMs > 0 && written < limit) await sleep(pauseMs)
    }
    if (townWrote) townsTouched.push(town)
  }

  return { considered, written, skippedFresh, towns: townsTouched }
}
