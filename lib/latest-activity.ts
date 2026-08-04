import { mlsTimestampMs } from '@/lib/mls-time'

/**
 * Freshest clock for Latest ranking / day headers.
 *
 * Prefer `eventAt` when the row already resolved a badge-specific clock
 * (PriceChangeTimestamp for Reduced/Increased, status/list for CS/BOM/New).
 * Without eventAt, fall back to list date only — never ModificationTimestamp.
 * Mod bumps (remarks/photos/legal) are not /latest ranking signals.
 */
export function latestActivityIso(
  modificationTimestamp: string | null | undefined,
  listDate: string | null | undefined,
  eventAt?: string | null | undefined,
): string | null {
  const event = eventAt?.trim() || null
  if (event) return event

  // modificationTimestamp intentionally unused — kept in the signature so
  // existing LatestListingRow call sites stay stable.
  void modificationTimestamp
  return listDate?.trim() || null
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
