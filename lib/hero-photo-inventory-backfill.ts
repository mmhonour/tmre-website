import 'server-only'

import { listActiveMlsIdsMissingShowcaseHeroes } from '@/lib/db/listing-photo-index-repo'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  advanceHeroInventoryTown,
  HERO_INVENTORY_BACKFILL_BATCH,
  HERO_INVENTORY_CURSOR_KEY,
  parseHeroInventoryCursor,
  type HeroInventoryCursor,
} from '@/lib/hero-photo-inventory-backfill-shared'
import { warmListingShowcasePhotos } from '@/lib/listing-photos-sync'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

function railwayMustNotFetchPhotos(): boolean {
  return process.env.MLS_SYNC_SERVICE === '1'
}

async function readCursor(): Promise<HeroInventoryCursor> {
  return parseHeroInventoryCursor(
    getSyncMeta(HERO_INVENTORY_CURSOR_KEY),
    TMRE_TOWNS,
  )
}

async function writeCursor(cursor: HeroInventoryCursor): Promise<void> {
  await setSyncMetaDurable(
    HERO_INVENTORY_CURSOR_KEY,
    JSON.stringify({
      ...cursor,
      updatedAt: new Date().toISOString(),
    }),
  )
}

/**
 * Operator / dedicated photo process only. Walk Active inventory and pull
 * the first six full-size shots for listings the index says are short.
 * Do not call this from the public website worker or from Incremental —
 * Media downloads share the same DB and photo bucket visitors use.
 */
export async function drainHeroInventoryBackfill(): Promise<{
  attempted: number
  warmed: number
  photos: number
  town: string
  remainingInTown: boolean
}> {
  const empty = {
    attempted: 0,
    warmed: 0,
    photos: 0,
    town: '',
    remainingInTown: false,
  }
  if (railwayMustNotFetchPhotos()) return empty

  let cursor = await readCursor()
  let ids: string[] = []

  for (let hop = 0; hop < TMRE_TOWNS.length; hop++) {
    ids = await listActiveMlsIdsMissingShowcaseHeroes({
      town: cursor.town,
      afterMlsId: cursor.afterMlsId,
      limit: HERO_INVENTORY_BACKFILL_BATCH,
    })
    if (ids.length > 0) break
    cursor = advanceHeroInventoryTown(cursor, TMRE_TOWNS)
  }

  if (ids.length === 0) {
    await writeCursor(cursor)
    return { ...empty, town: cursor.town }
  }

  let warmed = 0
  let photos = 0
  for (const mlsId of ids) {
    try {
      const { listing } = await readListingFromDbByMlsId(mlsId)
      if (!listing) continue
      const stored = await warmListingShowcasePhotos(listing)
      photos += stored
      if (stored > 0) warmed += 1
    } catch (err) {
      console.warn(
        `[hero-inventory-backfill] ${mlsId} failed`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  const remainingInTown = ids.length >= HERO_INVENTORY_BACKFILL_BATCH
  const next: HeroInventoryCursor = remainingInTown
    ? { ...cursor, afterMlsId: ids[ids.length - 1]! }
    : advanceHeroInventoryTown(cursor, TMRE_TOWNS)
  await writeCursor(next)

  return {
    attempted: ids.length,
    warmed,
    photos,
    town: cursor.town,
    remainingInTown,
  }
}
