import 'server-only'

import {
  countActiveShowcaseHeroCoverage,
  listActiveMlsIdsMissingShowcaseHeroes,
  listOldestActiveMlsIdsMissingShowcaseHeroes,
} from '@/lib/db/listing-photo-index-repo'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  advanceHeroInventoryTown,
  formatHeroPhotosInterruptedMessage,
  formatHeroPhotosJobMessage,
  HERO_INVENTORY_BACKFILL_BATCH,
  HERO_INVENTORY_CURSOR_KEY,
  HERO_PHOTOS_SKIP_KEY,
  HERO_PHOTOS_STATUS_KEY,
  HERO_SCAVENGE_BATCH,
  HERO_SCAVENGE_BURST_MS,
  LAST_HERO_PHOTOS_META_KEY,
  mergeHeroPhotosSkipMlsIds,
  parseHeroInventoryCursor,
  parseHeroPhotosJobStatus,
  parseHeroPhotosSkipMlsIds,
  pctMissing,
  heroMissingPctAfter,
  shouldAbortHeroScavengeEmptyBurst,
  type HeroInventoryCursor,
  type HeroPhotosJobStatus,
} from '@/lib/hero-photo-inventory-backfill-shared'
import { warmListingShowcasePhotos } from '@/lib/listing-photos-sync'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

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

async function persistProgress(status: HeroPhotosJobStatus): Promise<void> {
  await setSyncMetaDurable(HERO_PHOTOS_STATUS_KEY, JSON.stringify(status))
}

async function persistFinished(status: HeroPhotosJobStatus): Promise<void> {
  await persistProgress(status)
  await setSyncMetaDurable(LAST_HERO_PHOTOS_META_KEY, status.generatedAt)
}

async function readSkipMlsIds(): Promise<string[]> {
  return parseHeroPhotosSkipMlsIds(getSyncMeta(HERO_PHOTOS_SKIP_KEY))
}

async function writeSkipMlsIds(ids: string[]): Promise<void> {
  await setSyncMetaDurable(
    HERO_PHOTOS_SKIP_KEY,
    JSON.stringify({
      ids,
      updatedAt: new Date().toISOString(),
    }),
  )
}

function buildStatus(input: {
  withPhotosBefore: number
  withPhotosAfter: number
  missingBefore: number
  missingAfter: number
  filledListings: number
  filledPhotos: number
  idle: boolean
  running?: boolean
  walkedPast?: number
  stalledEmpty?: boolean
}): HeroPhotosJobStatus {
  const missingPctBefore = pctMissing(input.missingBefore, input.withPhotosBefore)
  const missingPctAfter = heroMissingPctAfter({
    missingAfter: input.missingAfter,
    withPhotosBefore: input.withPhotosBefore,
    withPhotosAfter: input.withPhotosAfter,
    filledListings: input.filledListings,
    filledPhotos: input.filledPhotos,
  })
  const complete = input.missingAfter === 0 && !input.running
  const draft: HeroPhotosJobStatus = {
    generatedAt: new Date().toISOString(),
    activeWithPhotos: input.withPhotosBefore,
    activeWithPhotosAfter:
      input.withPhotosAfter !== input.withPhotosBefore
        ? input.withPhotosAfter
        : undefined,
    missingBefore: input.missingBefore,
    missingAfter: input.missingAfter,
    missingPctBefore,
    missingPctAfter,
    filledListings: input.filledListings,
    filledPhotos: input.filledPhotos,
    walkedPast: input.walkedPast && input.walkedPast > 0 ? input.walkedPast : undefined,
    stalledEmpty: input.stalledEmpty || undefined,
    complete,
    idle: !input.running && (input.idle || complete),
    running: Boolean(input.running) && !complete,
    message: '',
  }
  draft.message = formatHeroPhotosJobMessage(draft)
  return draft
}

async function warmIds(
  ids: string[],
): Promise<{ listings: number; photos: number; empty: string[]; failed: string[] }> {
  let listings = 0
  let photos = 0
  const empty: string[] = []
  const failed: string[] = []
  for (const mlsId of ids) {
    try {
      const { listing } = await readListingFromDbByMlsId(mlsId)
      if (!listing) {
        empty.push(mlsId)
        continue
      }
      const stored = await warmListingShowcasePhotos(listing)
      photos += stored
      if (stored > 0) listings += 1
      else empty.push(mlsId)
    } catch (err) {
      failed.push(mlsId)
      console.warn(
        `[hero-photos] ${mlsId} failed`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return { listings, photos, empty, failed }
}

/**
 * Low-priority sync-queue job. Oldest Active gaps first (first six `?size=full`
 * slots). Short bursts so Incremental / stats / CAMA stay ahead. Unfillable
 * ids stay on the skip list so the next hop — and the next 15-minute slot —
 * picks up leftovers still missing R2. Full galleries / Closed stay on the
 * operator CLI. When every Active already has six full-size heroes, the run
 * is a count + status write (idle).
 */
export async function runHeroPhotoScavengeJob(): Promise<HeroPhotosJobStatus> {
  const before = await countActiveShowcaseHeroCoverage()
  if (before.missing === 0) {
    const status = buildStatus({
      withPhotosBefore: before.withPhotos,
      withPhotosAfter: before.withPhotos,
      missingBefore: 0,
      missingAfter: 0,
      filledListings: 0,
      filledPhotos: 0,
      idle: true,
    })
    await persistFinished(status)
    console.info(`[hero-photos] ${status.message}`)
    return status
  }

  const started = buildStatus({
    withPhotosBefore: before.withPhotos,
    withPhotosAfter: before.withPhotos,
    missingBefore: before.missing,
    missingAfter: before.missing,
    filledListings: 0,
    filledPhotos: 0,
    idle: false,
    running: true,
  })
  await persistProgress(started)
  console.info(`[hero-photos] ${started.message}`)

  const deadline = Date.now() + HERO_SCAVENGE_BURST_MS
  let filledListings = 0
  let filledPhotos = 0
  let walkedPast = 0
  let skipIds = await readSkipMlsIds()
  const triedThisBurst = new Set<string>()
  let wrappedSkip = false
  let consecutiveEmptyBatches = 0
  let stalledEmpty = false

  while (Date.now() < deadline) {
    let ids = await listOldestActiveMlsIdsMissingShowcaseHeroes(
      HERO_SCAVENGE_BATCH,
      { excludeMlsIds: [...skipIds, ...triedThisBurst] },
    )
    if (ids.length === 0) {
      if (wrappedSkip || skipIds.length === 0) break
      const skipBeforeWrap = skipIds
      skipIds = []
      wrappedSkip = true
      ids = await listOldestActiveMlsIdsMissingShowcaseHeroes(
        HERO_SCAVENGE_BATCH,
        { excludeMlsIds: [...triedThisBurst] },
      )
      if (ids.length === 0) {
        // Already tried the leftover set this burst — keep skip so the next
        // 15-minute slot wraps with an empty tried set instead of re-fetching
        // the same unfillable oldest listings until the clock runs out.
        skipIds = skipBeforeWrap
        break
      }
      await writeSkipMlsIds([])
    }
    const warmed = await warmIds(ids)
    filledListings += warmed.listings
    filledPhotos += warmed.photos
    for (const id of ids) triedThisBurst.add(id)
    if (warmed.empty.length > 0) {
      walkedPast += warmed.empty.length
      skipIds = mergeHeroPhotosSkipMlsIds(skipIds, warmed.empty)
    }
    if (warmed.listings === 0 && warmed.photos === 0) {
      consecutiveEmptyBatches += 1
    } else {
      consecutiveEmptyBatches = 0
    }
    if (
      shouldAbortHeroScavengeEmptyBurst({
        consecutiveEmptyBatches,
        filledPhotos,
        filledListings,
        wrappedSkip,
      })
    ) {
      stalledEmpty = true
      const mid = buildStatus({
        withPhotosBefore: before.withPhotos,
        withPhotosAfter: before.withPhotos,
        missingBefore: before.missing,
        missingAfter: before.missing,
        filledListings,
        filledPhotos,
        walkedPast,
        stalledEmpty: true,
        idle: false,
        running: true,
      })
      await persistProgress(mid)
      console.info(`[hero-photos] ${mid.message}`)
      break
    }
    if (warmed.empty.length > 0) {
      await writeSkipMlsIds(skipIds)
    }
    const mid = buildStatus({
      withPhotosBefore: before.withPhotos,
      withPhotosAfter: before.withPhotos,
      missingBefore: before.missing,
      missingAfter: before.missing,
      filledListings,
      filledPhotos,
      walkedPast,
      idle: false,
      running: true,
    })
    await persistProgress(mid)
    console.info(`[hero-photos] ${mid.message}`)
  }

  await writeSkipMlsIds(skipIds)
  const after = await countActiveShowcaseHeroCoverage()
  const status = buildStatus({
    withPhotosBefore: before.withPhotos,
    withPhotosAfter: after.withPhotos,
    missingBefore: before.missing,
    missingAfter: after.missing,
    filledListings,
    filledPhotos,
    walkedPast,
    stalledEmpty: stalledEmpty || undefined,
    idle: after.missing === 0,
  })
  await persistFinished(status)
  console.info(`[hero-photos] ${status.message}`)
  return status
}

/** Coverage snapshot so Admin Status has % before the child starts fetching. */
export async function stampHeroPhotosQueuedStatus(): Promise<HeroPhotosJobStatus> {
  const before = await countActiveShowcaseHeroCoverage()
  const status = buildStatus({
    withPhotosBefore: before.withPhotos,
    withPhotosAfter: before.withPhotos,
    missingBefore: before.missing,
    missingAfter: before.missing,
    filledListings: 0,
    filledPhotos: 0,
    idle: before.missing === 0,
    running: before.missing > 0,
  })
  if (before.missing === 0) {
    await persistFinished(status)
  } else {
    await persistProgress(status)
  }
  return status
}

export function readHeroPhotosJobStatus(): HeroPhotosJobStatus | null {
  return parseHeroPhotosJobStatus(getSyncMeta(HERO_PHOTOS_STATUS_KEY))
}

/**
 * Reaper hook: the parent vanished mid-burst. Keep last_hero_photos (last
 * successful End) and rewrite Status so the board does not keep showing the
 * previous Done counts next to "Crashed".
 */
export async function stampHeroPhotosInterruptedStatus(
  reason = 'runner vanished',
): Promise<HeroPhotosJobStatus> {
  const { getSyncMeta: getSyncMetaFresh } = await import('@/lib/db/sync-meta')
  const prev = parseHeroPhotosJobStatus(
    await getSyncMetaFresh(HERO_PHOTOS_STATUS_KEY),
  )
  const status: HeroPhotosJobStatus = {
    generatedAt: new Date().toISOString(),
    activeWithPhotos: prev?.activeWithPhotos ?? 0,
    activeWithPhotosAfter: prev?.activeWithPhotosAfter,
    missingBefore: prev?.missingBefore ?? 0,
    missingAfter: prev?.missingAfter ?? prev?.missingBefore ?? 0,
    missingPctBefore: prev?.missingPctBefore ?? 0,
    missingPctAfter: prev?.missingPctAfter ?? prev?.missingPctBefore ?? 0,
    filledListings: prev?.filledListings ?? 0,
    filledPhotos: prev?.filledPhotos ?? 0,
    walkedPast: prev?.walkedPast,
    stalledEmpty: prev?.stalledEmpty,
    complete: false,
    idle: false,
    running: false,
    interrupted: true,
    message: formatHeroPhotosInterruptedMessage(prev, reason),
  }
  await persistProgress(status)
  return status
}

/** Town-cursor burst — used by the operator CLI, not the website worker. */
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

  const warmed = await warmIds(ids)
  const remainingInTown = ids.length >= HERO_INVENTORY_BACKFILL_BATCH
  const next: HeroInventoryCursor = remainingInTown
    ? { ...cursor, afterMlsId: ids[ids.length - 1]! }
    : advanceHeroInventoryTown(cursor, TMRE_TOWNS)
  await writeCursor(next)

  return {
    attempted: ids.length,
    warmed: warmed.listings,
    photos: warmed.photos,
    town: cursor.town,
    remainingInTown,
  }
}
