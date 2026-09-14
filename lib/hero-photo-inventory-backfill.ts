import 'server-only'

import { drainIncrementalPhotoWarm } from '@/lib/incremental-photo-warm'
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
 * Lane 3 only — walk Active inventory and pull the first six full-size shots
 * for listings the index says are short. Railway Incremental must not call
 * this (Media bodies OOM the puller). New inserts still go through
 * `incremental_photo_warm_queue` first.
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

/**
 * New Incremental ids first. When that queue is empty, walk Active gaps.
 * Call only from Lane 3 / Netlify postHooks — never Railway.
 */
export async function runLane3ShowcasePhotoWarm(): Promise<{
  incremental: Awaited<ReturnType<typeof drainIncrementalPhotoWarm>>
  inventory: Awaited<ReturnType<typeof drainHeroInventoryBackfill>> | null
}> {
  const incremental = await drainIncrementalPhotoWarm()
  if (incremental.attempted > 0) {
    console.info(
      `[sync-listings-work] showcase photo warm ${incremental.warmed}/${incremental.attempted} listings (${incremental.remaining} left)`,
    )
  }
  if (incremental.attempted > 0 || incremental.remaining > 0) {
    return { incremental, inventory: null }
  }
  const inventory = await drainHeroInventoryBackfill()
  if (inventory.attempted > 0) {
    console.info(
      `[sync-listings-work] hero inventory warm ${inventory.town} ${inventory.warmed}/${inventory.attempted} listings · ${inventory.photos} photos`,
    )
  }
  return { incremental, inventory }
}
