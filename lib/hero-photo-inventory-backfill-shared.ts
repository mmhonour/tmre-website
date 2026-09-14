/** First six showcase shots (`warmListingShowcasePhotos` / `?size=full`). */
export const SHOWCASE_HERO_PHOTO_SLOTS = 6

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
  activeWithPhotos: number
  missingBefore: number
  missingAfter: number
  missingPctBefore: number
  missingPctAfter: number
  filledListings: number
  filledPhotos: number
  /** MLS ids this burst tried that stored nothing — walked on, skipped next burst. */
  walkedPast?: number
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

export function formatHeroPhotosInterruptedMessage(
  prev: HeroPhotosJobStatus | null,
  reason = 'runner vanished',
): string {
  const last = prev?.message?.trim()
  if (last) return `interrupted — ${reason} · last: ${last}`
  return `interrupted — ${reason}`
}

function walkedPastClause(status: HeroPhotosJobStatus): string {
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
  const total = status.activeWithPhotos.toLocaleString()
  const missingN = status.missingBefore.toLocaleString()
  const walked = walkedPastClause(status)
  if (status.running) {
    if (status.filledListings > 0 || status.filledPhotos > 0) {
      return (
        `running · was ${status.missingPctBefore}% missing (${missingN}/${total})` +
        ` · filled ${status.filledListings} listings / ${status.filledPhotos} photos so far` +
        walked
      )
    }
    if ((status.walkedPast ?? 0) > 0) {
      return (
        `running · ${status.missingPctBefore}% missing (${missingN}/${total})` +
        walked
      )
    }
    return `running · ${status.missingPctBefore}% missing (${missingN}/${total}) · burst starting`
  }
  if (status.idle || status.complete) {
    if (status.filledListings > 0) {
      return (
        `idle · was ${status.missingPctBefore}% missing` +
        ` · filled ${status.filledListings} listings / ${status.filledPhotos} photos` +
        walked +
        ` · now 0% missing · 100% complete`
      )
    }
    return `idle · 0% missing · ${total} Active with photos · 100% complete`
  }
  return (
    `was ${status.missingPctBefore}% missing (${missingN}/${total})` +
    ` · filled ${status.filledListings} listings / ${status.filledPhotos} photos` +
    walked +
    ` · now ${status.missingPctAfter}% missing`
  )
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
