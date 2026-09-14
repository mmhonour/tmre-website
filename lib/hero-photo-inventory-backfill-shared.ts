/** First six showcase shots (`warmListingShowcasePhotos` / `?size=full`). */
export const SHOWCASE_HERO_PHOTO_SLOTS = 6

/** Lane 3 hop — leftover Active gaps wait for the next side-work run. */
export const HERO_INVENTORY_BACKFILL_BATCH = 4

export const HERO_INVENTORY_CURSOR_KEY = 'hero_photo_inventory_cursor'

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
