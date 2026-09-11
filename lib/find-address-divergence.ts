import { normalizeStreetLine } from '@/lib/property-address'

/**
 * Vision site line vs MLS street, already on the Find payload.
 * Same parcel can spell the house/street differently (`2A STONY PT RD`
 * vs `2A-A Stony Point Road`). Ln↔Lane / Rd↔Road is the same street —
 * case is ignored. The page only displays the flag.
 */
export type FindAddressDivergence = {
  visionStreet: string
  mlsStreet: string | null
  diverge: boolean
}

export function normalizeFindAddressLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function findAddressLinesDiverge(
  visionStreet: string,
  mlsStreet: string | null | undefined,
): boolean {
  const vision = normalizeFindAddressLine(visionStreet)
  const mls = normalizeFindAddressLine(mlsStreet ?? '')
  if (!vision || !mls) return false
  if (vision === mls) return false
  return normalizeStreetLine(visionStreet) !== normalizeStreetLine(mlsStreet ?? '')
}

export function findAddressDivergence(
  visionStreet: string,
  mlsStreet: string | null | undefined,
): FindAddressDivergence {
  const vision = visionStreet.replace(/\s+/g, ' ').trim()
  const mls = mlsStreet?.replace(/\s+/g, ' ').trim() || null
  return {
    visionStreet: vision,
    mlsStreet: mls,
    diverge: findAddressLinesDiverge(vision, mls),
  }
}
