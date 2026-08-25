import { filterListingsByKind, type ListingKind } from '@/lib/listing-kind'
import type { GoldilocksDomTier } from '@/lib/goldilocks-config-shared'
import type { Listing } from '@/lib/rets'

/** One calendar day-range flattened from Goldilocks DOM tiers (admin). */
export type DomBandDef = {
  /** Stable id: `{tierId}:{min}-{max|plus}` */
  id: string
  tierId: string
  tierLabel: string
  /** Display e.g. "0–29" or "251+". */
  label: string
  shortLabel: string
  minDays: number
  maxDays: number | null
}

export type DomBandBucket = DomBandDef & {
  count: number
}

export type ActiveByDomPayload = {
  city: string
  kind: ListingKind
  totalActive: number
  knownDom: number
  unknownDom: number
  buckets: DomBandBucket[]
}

export function formatDomBandLabel(
  minDays: number,
  maxDays: number | null,
): string {
  if (maxDays == null) return `${minDays}+`
  if (minDays === maxDays) return String(minDays)
  return `${minDays}–${maxDays}`
}

/**
 * Flatten admin DOM tiers into sequential day-range bands, sorted by min days
 * ascending (0–29, then 30–59, …). Discontinuous tier ranges become separate
 * points in calendar order.
 */
export function flattenDomTiersToSequentialBands(
  tiers: readonly GoldilocksDomTier[],
): DomBandDef[] {
  const out: DomBandDef[] = []
  for (const tier of tiers) {
    for (const range of tier.ranges) {
      if (!Number.isFinite(range.minDays) || range.minDays < 0) continue
      const minDays = Math.round(range.minDays)
      const maxDays =
        range.maxDays == null || !Number.isFinite(range.maxDays)
          ? null
          : Math.round(range.maxDays)
      const label = formatDomBandLabel(minDays, maxDays)
      out.push({
        id: `${tier.id}:${minDays}-${maxDays ?? 'plus'}`,
        tierId: tier.id,
        tierLabel: tier.label,
        label,
        shortLabel: label,
        minDays,
        maxDays,
      })
    }
  }
  out.sort((a, b) => {
    if (a.minDays !== b.minDays) return a.minDays - b.minDays
    const aMax = a.maxDays ?? Number.POSITIVE_INFINITY
    const bMax = b.maxDays ?? Number.POSITIVE_INFINITY
    return aMax - bMax
  })
  return out
}

/** Read the day range back out of a band id (`{tierId}:{min}-{max|plus}`). */
export function parseDomBandId(
  id: string,
): { minDays: number; maxDays: number | null } | null {
  const range = id.trim().split(':').pop() ?? ''
  const m = range.match(/^(\d+)-(\d+|plus)$/)
  if (!m) return null
  const minDays = Number(m[1])
  if (!Number.isFinite(minDays)) return null
  if (m[2] === 'plus') return { minDays, maxDays: null }
  const maxDays = Number(m[2])
  if (!Number.isFinite(maxDays)) return null
  return { minDays, maxDays }
}

export function listingMatchesDomBand(
  dom: number | null | undefined,
  minDays: number,
  maxDays: number | null,
): boolean {
  if (dom == null || !Number.isFinite(dom) || dom < 0) return false
  const days = Math.round(dom)
  if (days < minDays) return false
  if (maxDays == null) return true
  return days <= maxDays
}

/** Count active inventory into sequential DOM bands from Goldilocks config. */
export function computeActiveByDom(
  activeListings: Listing[],
  city: string,
  kind: ListingKind,
  tiers: readonly GoldilocksDomTier[],
): ActiveByDomPayload {
  const bands = flattenDomTiersToSequentialBands(tiers)
  const filtered = filterListingsByKind(activeListings, kind)
  const counts = new Map<string, number>()
  for (const b of bands) counts.set(b.id, 0)

  let total = 0
  let unknownDom = 0
  for (const l of filtered) {
    total += 1
    const dom = l.dom
    if (dom == null || !Number.isFinite(dom) || dom < 0) {
      unknownDom += 1
      continue
    }
    const days = Math.round(dom)
    const match = bands.find((b) =>
      listingMatchesDomBand(days, b.minDays, b.maxDays),
    )
    if (match) {
      counts.set(match.id, (counts.get(match.id) ?? 0) + 1)
    } else {
      unknownDom += 1
    }
  }

  const buckets: DomBandBucket[] = bands.map((b) => ({
    ...b,
    count: counts.get(b.id) ?? 0,
  }))

  return {
    city,
    kind,
    totalActive: total,
    knownDom: total - unknownDom,
    unknownDom,
    buckets,
  }
}
