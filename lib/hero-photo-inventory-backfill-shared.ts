/** First six showcase shots (`warmListingShowcasePhotos` / `?size=full`). */
export const SHOWCASE_HERO_PHOTO_SLOTS = 6
/** MLS photo_count cap — same ceiling as listing-photos-sync / R2 warm. */
export const LISTING_PHOTO_SLOT_CAP = 60

/** Town-cursor hop for the operator CLI — leftover Active gaps wait for the next pass. */
export const HERO_INVENTORY_BACKFILL_BATCH = 4

export const HERO_INVENTORY_CURSOR_KEY = 'hero_photo_inventory_cursor'

/** Five listings, then the next five, until the burst clock runs out. */
export const HERO_SCAVENGE_BATCH = 5
/** Leave a minute for the recount inside a 10-minute Configure budget. */
export const HERO_SCAVENGE_BURST_MS = 9 * 60 * 1000

export const HERO_PHOTOS_STATUS_KEY = 'hero_photos_status'
export const LAST_HERO_PHOTOS_META_KEY = 'last_hero_photos'
/** MLS ids that stored nothing last burst — next burst walks past them. */
export const HERO_PHOTOS_SKIP_KEY = 'hero_photos_skip_mls_ids'
export const HERO_PHOTOS_SKIP_MAX = 400
/**
 * After wrap, three empty hops (15 listings) with zero fills means Media/RETS
 * is down. First pass never aborts for empties — skip persists so the next
 * hop (and the next 15-minute burst) walks past unfillable oldest leftovers.
 */
export const HERO_SCAVENGE_EMPTY_ABORT_BATCHES = 3

export function shouldAbortHeroScavengeEmptyBurst(input: {
  consecutiveEmptyBatches: number
  filledPhotos: number
  filledListings: number
  wrappedSkip: boolean
}): boolean {
  return (
    input.wrappedSkip &&
    input.filledPhotos === 0 &&
    input.filledListings === 0 &&
    input.consecutiveEmptyBatches >= HERO_SCAVENGE_EMPTY_ABORT_BATCHES
  )
}

export function parseHeroPhotosSkipMlsIds(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as { ids?: unknown }
    if (!Array.isArray(parsed.ids)) return []
    return parsed.ids
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim())
      .slice(0, HERO_PHOTOS_SKIP_MAX)
  } catch {
    return []
  }
}

export function mergeHeroPhotosSkipMlsIds(
  persisted: readonly string[],
  triedThisBurst: readonly string[],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of [...persisted, ...triedThisBurst]) {
    const t = id.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.slice(-HERO_PHOTOS_SKIP_MAX)
}

export type HeroPhotosJobStatus = {
  generatedAt: string
  /**
   * Listings-with-photos count used in the "was … (missing/total)" fraction
   * (any status). Must be the before-burst inventory so a growing book cannot
   * pull the displayed % down when this burst stored nothing.
   */
  activeWithPhotos: number
  /** After-burst listings-with-photos count; omitted when it matches `activeWithPhotos`. */
  activeWithPhotosAfter?: number
  missingBefore: number
  missingAfter: number
  missingPctBefore: number
  missingPctAfter: number
  filledListings: number
  filledPhotos: number
  /** MLS ids this burst tried that stored nothing — walked on, skipped next burst. */
  walkedPast?: number
  /**
   * Burst stopped after wrap + consecutive empty hops with zero fills.
   * Skip list is still persisted so the next 15-minute slot continues past
   * those ids (cap 400, then wrap and retry). First-pass empties never stall.
   */
  stalledEmpty?: boolean
  complete: boolean
  idle: boolean
  /** True while a burst is queued or in flight — board should keep polling. */
  running?: boolean
  /** True when the runner vanished mid-burst (reaped). End stamp stays. */
  interrupted?: boolean
  message: string
}

export function pctMissing(missing: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((missing / total) * 1000) / 10
}

/**
 * Denominator for the after snapshot. Zero fills must not look like coverage
 * progress just because more listings arrived in the book.
 */
export function heroMissingAfterTotal(input: {
  withPhotosBefore: number
  withPhotosAfter: number
  filledListings: number
  filledPhotos: number
}): number {
  if (input.filledListings > 0 || input.filledPhotos > 0) {
    return input.withPhotosAfter
  }
  if (input.withPhotosAfter > input.withPhotosBefore) {
    return input.withPhotosBefore
  }
  return input.withPhotosAfter
}

export function heroMissingPctAfter(input: {
  missingAfter: number
  withPhotosBefore: number
  withPhotosAfter: number
  filledListings: number
  filledPhotos: number
}): number {
  return pctMissing(input.missingAfter, heroMissingAfterTotal(input))
}

function missingShare(pct: number, missing: number, total: number): string {
  return `${pct}% missing (${missing.toLocaleString()}/${total.toLocaleString()})`
}

export function formatHeroPhotosInterruptedMessage(
  prev: HeroPhotosJobStatus | null,
  reason = 'runner vanished',
): string {
  const last = prev?.message?.trim()
  if (last) return `interrupted — ${reason} · last: ${last}`
  return `interrupted — ${reason}`
}

function walkedPastClause(status: HeroPhotosJobStatus): string {
  if (status.stalledEmpty) {
    const n = status.walkedPast ?? 0
    const tried = n > 0 ? ` ${n}` : ''
    return ` · skipped${tried} that stored nothing (next burst continues past them)`
  }
  const n = status.walkedPast ?? 0
  if (n <= 0) return ''
  return ` · walked past ${n} that stored nothing`
}

export function formatHeroPhotosJobMessage(status: HeroPhotosJobStatus): string {
  if (status.interrupted) {
    return status.message.startsWith('interrupted')
      ? status.message
      : formatHeroPhotosInterruptedMessage(status)
  }
  const beforeTotal = status.activeWithPhotos
  const afterTotal = heroMissingAfterTotal({
    withPhotosBefore: status.activeWithPhotos,
    withPhotosAfter: status.activeWithPhotosAfter ?? status.activeWithPhotos,
    filledListings: status.filledListings,
    filledPhotos: status.filledPhotos,
  })
  const before = missingShare(
    status.missingPctBefore,
    status.missingBefore,
    beforeTotal,
  )
  const after = missingShare(
    status.missingPctAfter,
    status.missingAfter,
    afterTotal,
  )
  const filled =
    `filled ${status.filledListings} listings / ${status.filledPhotos} photos`
  const walked = walkedPastClause(status)
  if (status.running) {
    if (status.filledListings > 0 || status.filledPhotos > 0) {
      return `running · was ${before} · ${filled} so far` + walked
    }
    if (status.stalledEmpty || (status.walkedPast ?? 0) > 0) {
      return `running · ${before}` + walked
    }
    return `running · ${before} · burst starting`
  }
  if (status.idle || status.complete) {
    if (status.filledListings > 0) {
      return `idle · was ${before} · ${filled}` + walked + ` · now ${after} · 100% complete`
    }
    return `idle · ${after} · 100% complete`
  }
  return `was ${before} · ${filled}` + walked + ` · now ${after}`
}

export function parseHeroPhotosJobStatus(
  raw: string | null | undefined,
): HeroPhotosJobStatus | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<HeroPhotosJobStatus>
    if (typeof parsed.message !== 'string') return null
    return {
      generatedAt:
        typeof parsed.generatedAt === 'string' ? parsed.generatedAt : '',
      activeWithPhotos: Number(parsed.activeWithPhotos) || 0,
      missingBefore: Number(parsed.missingBefore) || 0,
      missingAfter: Number(parsed.missingAfter) || 0,
      missingPctBefore: Number(parsed.missingPctBefore) || 0,
      missingPctAfter: Number(parsed.missingPctAfter) || 0,
      filledListings: Number(parsed.filledListings) || 0,
      filledPhotos: Number(parsed.filledPhotos) || 0,
      walkedPast: Number(parsed.walkedPast) || 0,
      activeWithPhotosAfter:
        typeof parsed.activeWithPhotosAfter === 'number' &&
        Number.isFinite(parsed.activeWithPhotosAfter)
          ? parsed.activeWithPhotosAfter
          : undefined,
      stalledEmpty: Boolean(parsed.stalledEmpty) || undefined,
      complete: Boolean(parsed.complete),
      idle: Boolean(parsed.idle),
      running: Boolean(parsed.running),
      interrupted: Boolean(parsed.interrupted),
      message: parsed.message,
    }
  } catch {
    return null
  }
}

export type HeroInventoryCursor = {
  town: string
  afterMlsId: string
  cycle: number
}

export function parseHeroInventoryCursor(
  raw: string | null,
  towns: readonly string[],
): HeroInventoryCursor {
  const fallback: HeroInventoryCursor = {
    town: towns[0] ?? '',
    afterMlsId: '',
    cycle: 0,
  }
  if (!raw?.trim()) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<HeroInventoryCursor>
    const town =
      typeof parsed.town === 'string' && towns.includes(parsed.town)
        ? parsed.town
        : fallback.town
    const afterMlsId =
      typeof parsed.afterMlsId === 'string' ? parsed.afterMlsId.trim() : ''
    const cycle =
      typeof parsed.cycle === 'number' && Number.isFinite(parsed.cycle)
        ? Math.max(0, Math.floor(parsed.cycle))
        : 0
    return { town, afterMlsId, cycle }
  } catch {
    return fallback
  }
}

/** Town exhausted → next TMRE town; last town wraps and bumps the cycle. */
export function advanceHeroInventoryTown(
  cursor: HeroInventoryCursor,
  towns: readonly string[],
): HeroInventoryCursor {
  if (towns.length === 0) return { ...cursor, afterMlsId: '' }
  const i = towns.indexOf(cursor.town)
  const nextIndex = i < 0 ? 0 : (i + 1) % towns.length
  const wrapped = i >= 0 && nextIndex === 0
  return {
    town: towns[nextIndex]!,
    afterMlsId: '',
    cycle: cursor.cycle + (wrapped ? 1 : 0),
  }
}
