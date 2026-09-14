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

export type HeroPhotosJobStatus = {
  generatedAt: string
  activeWithPhotos: number
  missingBefore: number
  missingAfter: number
  missingPctBefore: number
  missingPctAfter: number
  filledListings: number
  filledPhotos: number
  complete: boolean
  idle: boolean
  message: string
}

export function pctMissing(missing: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((missing / total) * 1000) / 10
}

export function formatHeroPhotosJobMessage(status: HeroPhotosJobStatus): string {
  if (status.idle || status.complete) {
    if (status.filledListings > 0) {
      return (
        `idle · was ${status.missingPctBefore}% missing` +
        ` · filled ${status.filledListings} listings / ${status.filledPhotos} photos` +
        ` · now 0% missing · 100% complete`
      )
    }
    return `idle · 0% missing · ${status.activeWithPhotos.toLocaleString()} Active with photos · 100% complete`
  }
  return (
    `was ${status.missingPctBefore}% missing (${status.missingBefore.toLocaleString()}/${status.activeWithPhotos.toLocaleString()})` +
    ` · filled ${status.filledListings} listings / ${status.filledPhotos} photos` +
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
      complete: Boolean(parsed.complete),
      idle: Boolean(parsed.idle),
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
