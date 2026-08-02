import { mlsTimestampMs } from '@/lib/mls-time'

/**
 * Freshest clock for Latest ranking / day headers.
 *
 * Prefer `eventAt` when the row already resolved a badge-specific clock
 * (PriceChangeTimestamp for Reduced/Increased, status change for BOM/CS, etc.).
 * Otherwise: MLS mod vs list date — brand-new inventory often has a newer
 * listDate than ModificationTimestamp.
 *
 * ModificationTimestamp alone is advertising/legal freshness and is not the
 * source of truth for a price-event row.
 */
export function latestActivityIso(
  modificationTimestamp: string | null | undefined,
  listDate: string | null | undefined,
  eventAt?: string | null | undefined,
): string | null {
  const event = eventAt?.trim() || null
  if (event) return event

  const mod = modificationTimestamp?.trim() || null
  const listed = listDate?.trim() || null
  if (!mod) return listed
  if (!listed) return mod
  const modMs = mlsTimestampMs(mod)
  const listMs = mlsTimestampMs(listed)
  if (Number.isNaN(modMs)) return listed
  if (Number.isNaN(listMs)) return mod
  return listMs > modMs ? listed : mod
}

export function latestActivityMs(
  modificationTimestamp: string | null | undefined,
  listDate: string | null | undefined,
  eventAt?: string | null | undefined,
): number {
  return mlsTimestampMs(
    latestActivityIso(modificationTimestamp, listDate, eventAt),
  )
}

/** Convenience for LatestListingRow-shaped objects. */
export function latestRowActivityIso(row: {
  modificationTimestamp?: string | null
  listDate?: string | null
  eventAt?: string | null
}): string | null {
  return latestActivityIso(
    row.modificationTimestamp,
    row.listDate,
    row.eventAt,
  )
}

export function latestRowActivityMs(row: {
  modificationTimestamp?: string | null
  listDate?: string | null
  eventAt?: string | null
}): number {
  return latestActivityMs(
    row.modificationTimestamp,
    row.listDate,
    row.eventAt,
  )
}
