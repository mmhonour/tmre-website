import type { StreetListingCard } from '@/lib/street-listing-card-shared'

export const STREET_LISTING_INGEST_PHASES = [
  'queued',
  'checking-db',
  'rets-id',
  'rets-address',
  'rets-closed',
  'found',
  'none',
  'error',
] as const

export type StreetListingIngestPhase =
  (typeof STREET_LISTING_INGEST_PHASES)[number]

export type StreetListingIngestProgress = {
  town: string
  visionPid: string
  addressLabel: string
  phase: StreetListingIngestPhase
  message: string
  listing: StreetListingCard | null
  updatedAt: string
}

export const STREET_LISTING_INGEST_IN_FLIGHT: ReadonlySet<StreetListingIngestPhase> =
  new Set(['queued', 'checking-db', 'rets-id', 'rets-address', 'rets-closed'])

export function streetListingIngestMetaKey(
  town: string,
  visionPid: string,
): string {
  return `street_listing_ingest:${town.trim().toLowerCase()}:${visionPid.trim()}`
}

export function isStreetListingIngestPhase(
  value: unknown,
): value is StreetListingIngestPhase {
  return (
    typeof value === 'string' &&
    (STREET_LISTING_INGEST_PHASES as readonly string[]).includes(value)
  )
}

export function parseStreetListingIngestProgress(
  raw: string | null | undefined,
): StreetListingIngestProgress | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StreetListingIngestProgress>
    if (
      typeof parsed.town !== 'string' ||
      typeof parsed.visionPid !== 'string' ||
      !isStreetListingIngestPhase(parsed.phase) ||
      typeof parsed.message !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null
    }
    const listing =
      parsed.listing &&
      typeof parsed.listing === 'object' &&
      typeof parsed.listing.id === 'string' &&
      parsed.listing.id.trim()
        ? {
            id: parsed.listing.id.trim(),
            mlsId:
              typeof parsed.listing.mlsId === 'string'
                ? parsed.listing.mlsId
                : null,
            status:
              typeof parsed.listing.status === 'string'
                ? parsed.listing.status
                : 'MLS',
            price:
              typeof parsed.listing.price === 'number' &&
              Number.isFinite(parsed.listing.price)
                ? parsed.listing.price
                : null,
            street:
              typeof parsed.listing.street === 'string'
                ? parsed.listing.street
                : '',
            town:
              typeof parsed.listing.town === 'string'
                ? parsed.listing.town
                : parsed.town,
          }
        : null
    return {
      town: parsed.town,
      visionPid: parsed.visionPid,
      addressLabel:
        typeof parsed.addressLabel === 'string' ? parsed.addressLabel : '',
      phase: parsed.phase,
      message: parsed.message,
      listing,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

/** Progress younger than this is still a live search the page can watch. */
export const STREET_LISTING_INGEST_FRESH_MS = 2 * 60 * 1000

export function streetListingIngestIsFresh(
  progress: StreetListingIngestProgress | null,
  now = Date.now(),
): boolean {
  if (!progress) return false
  const at = Date.parse(progress.updatedAt)
  if (!Number.isFinite(at)) return false
  return now - at <= STREET_LISTING_INGEST_FRESH_MS
}
