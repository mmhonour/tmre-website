/**
 * Vision ↔ listings join — single stack used by prod sync, Admin, and CLI.
 *
 * Prod path: syncVisionAddresses() → backfillVisionListingLinks()
 * (Netlify vision-addresses worker, Admin Sync now, npm run sync:vision-addresses).
 * Same function: npm run match:vision-listings.
 *
 * Gate for every auto-stamp: exactly one Vision PID. 2+ PIDs stay unmatched.
 * Near/Jaccard is diagnostic only (`match:vision-abbrev`) — not prod.
 * Find parcel ingest uses the same keys against Neon, then RETS
 * streetSearchVariants (Ln↔Lane, Rd↔Road) before giving up.
 */
import {
  addressMatchKey,
  addressMatchKeyLoose,
  normalizeParcelNumber,
} from '@/lib/property-address'

export {
  addressMatchKey,
  addressMatchKeyLoose,
  normalizeStreetLine,
  stripTrailingStreetType,
} from '@/lib/property-address'

export type VisionListingMatchHeuristicId =
  | 'zip-strip'
  | 'street-type-compass'
  | 'name-words'
  | 'exact-key'
  | 'trailing-street-type'
  | 'mblu'
  | 'unique-pid'
  | 'all-listings-at-key'

export type VisionListingMatchHeuristic = {
  id: VisionListingMatchHeuristicId
  label: string
  inProdSync: boolean
  example: string
}

export const VISION_LISTING_MATCH_HEURISTICS: VisionListingMatchHeuristic[] = [
  {
    id: 'zip-strip',
    label: 'Strip trailing ZIP',
    inProdSync: true,
    example: 'Vision `…|westport` matches MLS `…|westport|06880`',
  },
  {
    id: 'street-type-compass',
    label: 'Street type + compass tokens',
    inProdSync: true,
    example: '`28 Bulkley Avenue North` = `28 BULKLEY AVE N`',
  },
  {
    id: 'name-words',
    label: 'Mid-name USPS words',
    inProdSync: true,
    example: '`1 BLIND BRK RD S` = `1 Blind Brook Rd S` (brk↔brook)',
  },
  {
    id: 'exact-key',
    label: 'Exact addressMatchKey',
    inProdSync: true,
    example: 'Primary join after the token maps above',
  },
  {
    id: 'trailing-street-type',
    label: 'Optional trailing street type',
    inProdSync: true,
    example: 'MLS `1 Hemlock Hill Road` = VGSI `1 HEMLOCK HILL` (PID 8368)',
  },
  {
    id: 'mblu',
    label: 'Unique MBLU / ParcelNumber',
    inProdSync: true,
    example: 'Listing raw.ParcelNumber compact-equals vision_addresses.mblu',
  },
  {
    id: 'unique-pid',
    label: 'Exactly one Vision PID',
    inProdSync: true,
    example: '2+ PIDs at the same key (condos / split lots) stay unmatched',
  },
  {
    id: 'all-listings-at-key',
    label: 'Stamp every listing at the key',
    inProdSync: true,
    example: 'Re-lists included; not only the preferred status row',
  },
]

export function compactMblu(raw: string | null | undefined): string | null {
  return normalizeParcelNumber(raw)
}

export function visionListingKeys(addressNorm: string): {
  exact: string
  loose: string
} {
  const exact = addressMatchKey(addressNorm)
  return { exact, loose: addressMatchKeyLoose(addressNorm) }
}
