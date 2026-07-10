import 'server-only'

import {
  readStatsCacheRow,
  setSyncMeta,
  writeStatsCacheRow,
} from '@/lib/listings-db'
import {
  computeTopDeal,
  dealListingPhotoUrl,
  type DealPickPayload,
} from '@/lib/deal-pick'
import { ensureDealPickPhotos } from '@/lib/deal-hero-photo-warm'
import { fetchActiveListingsAcrossTowns, hasLocalListingsCache } from '@/lib/listings-store'
import { TMRE_MARKET_TOWNS } from '@/lib/rets'
import { filterListingsToTmreTowns, TMRE_TOWNS } from '@/lib/tmre-towns'

export const DEAL_OF_THE_WEEK_CACHE_KEY = 'deal-of-the-week:v1'

export type DealOfTheWeekResponse = DealPickPayload & {
  scope: { towns: string[] }
  source?: 'db' | 'rets'
  dealCache?: boolean
}

export function readDealOfTheWeekCache(): DealOfTheWeekResponse | null {
  if (!hasLocalListingsCache()) return null
  const row = readStatsCacheRow(DEAL_OF_THE_WEEK_CACHE_KEY)
  if (!row?.payload) return null
  try {
    return JSON.parse(row.payload) as DealOfTheWeekResponse
  } catch {
    return null
  }
}

export function writeDealOfTheWeekCache(payload: DealOfTheWeekResponse): void {
  writeStatsCacheRow(DEAL_OF_THE_WEEK_CACHE_KEY, payload)
}

/** Rebuild homepage Deal of the Week from SQLite + warm its hero photo. */
export async function rebuildDealOfTheWeekCache(): Promise<boolean> {
  const t0 = Date.now()
  const { listings: rawListings, source } = await fetchActiveListingsAcrossTowns(
    TMRE_MARKET_TOWNS,
    { limit: 500 },
  )
  const listings = filterListingsToTmreTowns(rawListings)
  const payload = await computeTopDeal(listings)
  if (!payload) {
    console.warn('[deal-of-the-week-cache] no qualifying listing')
    return false
  }

  const response: DealOfTheWeekResponse = {
    ...payload,
    photoUrl: payload.photoUrl || dealListingPhotoUrl(payload.listing),
    scope: { towns: [...TMRE_TOWNS] },
    source,
    dealCache: true,
  }
  writeDealOfTheWeekCache(response)
  setSyncMeta('last_deal_of_the_week_cache', new Date().toISOString())
  await ensureDealPickPhotos(response)
  console.info(
    `[deal-of-the-week-cache] rebuilt for ${response.listing.mlsId} in ${Date.now() - t0}ms`,
  )
  return true
}
