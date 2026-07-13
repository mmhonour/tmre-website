import 'server-only'

import type { LatestListingRow } from '@/lib/latest-listings'
import {
  LATEST_HERO_WARM_CONCURRENCY,
  LATEST_HERO_WARM_MAX_FETCHES_PER_CYCLE,
} from '@/lib/latest-refresh'
import { readListingPhotoMeta } from '@/lib/listing-photo-backend'
import {
  listingPhotoCacheId,
  resolveListingPhotoBuffer,
} from '@/lib/listing-photo-store'
import { isListingPhotoFresh } from '@/lib/listing-photo-ttl'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function heroPhotoIndex(row: LatestListingRow): number {
  if (row.primaryPhotoIndex != null && row.primaryPhotoIndex >= 0) {
    return row.primaryPhotoIndex
  }
  return 0
}

async function heroAlreadyCached(row: LatestListingRow): Promise<boolean> {
  const cacheId = listingPhotoCacheId({
    mlsId: row.mlsId,
    listingKey: row.listingKey,
  })
  if (!cacheId) return true
  const meta = await readListingPhotoMeta(cacheId, heroPhotoIndex(row))
  return meta != null && isListingPhotoFresh(meta.syncedAt)
}

async function fetchHeroPhoto(row: LatestListingRow): Promise<boolean> {
  const cacheId = listingPhotoCacheId({
    mlsId: row.mlsId,
    listingKey: row.listingKey,
  })
  if (!cacheId || (row.photoCount ?? 0) <= 0) return false

  const photoIndex = heroPhotoIndex(row)
  try {
    const hit = await resolveListingPhotoBuffer({
      mlsId: cacheId,
      listingKey: row.listingKey?.trim() || row.mlsId,
      photoIndex,
      photoCountHint: row.photoCount,
    })
    return hit != null && !hit.cacheHit
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/RETS env vars missing/i.test(message)) {
      console.warn(`[latest-hero-warm] failed for ${cacheId}`, message)
    }
    return false
  }
}

/**
 * Bounded hero thumbnail warm for /latest — runs during the 30-minute DB refresh,
 * not on page requests.
 *
 * Bounds:
 * - **Scope**: only listings in the Latest global + town feeds (~210 rows), not full MLS
 * - **Depth**: one lead thumbnail per listing (hero index), not full galleries
 * - **Volume**: at most `LATEST_HERO_WARM_MAX_FETCHES_PER_CYCLE` RETS downloads per cycle;
 *   already-cached heroes are skipped and do not count toward the cap
 * - **Concurrency**: limited parallel RETS fetches so the dev server stays responsive
 */
export async function warmLatestHeroPhotosBounded(options: {
  townFeeds: Record<string, LatestListingRow[]>
  globalListings?: LatestListingRow[]
}): Promise<{
  considered: number
  alreadyCached: number
  fetched: number
  deferred: number
  durationMs: number
}> {
  const t0 = Date.now()
  const seen = new Set<string>()
  const candidates: LatestListingRow[] = []

  const addRows = (rows: LatestListingRow[]) => {
    for (const row of rows) {
      if (seen.has(row.key)) continue
      seen.add(row.key)
      if ((row.photoCount ?? 0) <= 0) continue
      candidates.push(row)
    }
  }

  addRows(options.globalListings ?? [])
  for (const rows of Object.values(options.townFeeds)) {
    addRows(rows)
  }

  const cachedFlags = await Promise.all(
    candidates.map((row) => heroAlreadyCached(row)),
  )
  const needFetch: LatestListingRow[] = []
  let alreadyCached = 0
  candidates.forEach((row, i) => {
    if (cachedFlags[i]) {
      alreadyCached += 1
    } else {
      needFetch.push(row)
    }
  })

  const batch = needFetch.slice(0, LATEST_HERO_WARM_MAX_FETCHES_PER_CYCLE)
  const deferred = Math.max(0, needFetch.length - batch.length)
  let fetched = 0

  for (let i = 0; i < batch.length; i += LATEST_HERO_WARM_CONCURRENCY) {
    const chunk = batch.slice(i, i + LATEST_HERO_WARM_CONCURRENCY)
    const results = await Promise.all(chunk.map((row) => fetchHeroPhoto(row)))
    fetched += results.filter(Boolean).length
    await sleep(25)
  }

  const durationMs = Date.now() - t0
  console.info(
    `[latest-hero-warm] ${candidates.length} heroes / ${alreadyCached} cached / ${fetched} fetched / ${deferred} deferred — ${durationMs}ms`,
  )

  return {
    considered: candidates.length,
    alreadyCached,
    fetched,
    deferred,
    durationMs,
  }
}

let heroWarmRunning = false

/** Fire-and-forget bounded hero warm (after town feeds are in stats_cache). */
export function warmLatestHeroPhotosDeferred(options: {
  townFeeds: Record<string, LatestListingRow[]>
  globalListings?: LatestListingRow[]
}): void {
  if (heroWarmRunning) return
  heroWarmRunning = true
  void (async () => {
    try {
      await sleep(500)
      await warmLatestHeroPhotosBounded(options)
    } catch (err) {
      console.error('[latest-hero-warm] deferred warm failed', err)
    } finally {
      heroWarmRunning = false
    }
  })()
}
