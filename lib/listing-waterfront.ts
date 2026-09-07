/** SmartMLS `raw.DirectWaterfrontYN` / `raw.WaterfrontDescription`. */

export type ListingWaterfrontYn = 'Y' | 'N'

export function waterfrontYnFromRaw(
  raw?: Record<string, unknown> | null,
): ListingWaterfrontYn | null {
  const value = raw?.DirectWaterfrontYN
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return null
  if (normalized === '1' || normalized === 'y' || normalized === 'yes' || normalized === 'true') {
    return 'Y'
  }
  if (normalized === '0' || normalized === 'n' || normalized === 'no' || normalized === 'false') {
    return 'N'
  }
  return null
}

export function waterfrontDescriptionFromRaw(
  raw?: Record<string, unknown> | null,
): string | null {
  const value = raw?.WaterfrontDescription
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}
