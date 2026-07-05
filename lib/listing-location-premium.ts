import { haversineMiles, minDistanceMiles } from '@/lib/geo-distance'
import {
  GOLF_AMENITIES,
  TOWN_CENTERS,
  WATER_ACCESS_POINTS,
  ZIP_CENTERS,
  type GeoPoint,
} from '@/lib/tmre-geo'
import { townForZip, type TmreTown } from '@/lib/tmre-towns'

export type LocationPremiumFactors = {
  waterMiles: number | null
  townCenterMiles: number | null
  golfMiles: number | null
  /** Multiplicative boost from water proximity (1.0 = none). */
  waterMultiplier: number
  /** Multiplicative boost from town/zip center proximity. */
  centerMultiplier: number
  /** Multiplicative boost from golf / country club proximity. */
  golfMultiplier: number
  /** Combined multiplier applied to the If estimate. */
  combinedMultiplier: number
  /** Short labels for UI copy (e.g. "Near Long Island Sound"). */
  labels: string[]
}

const MAX_COMBINED_MULTIPLIER = 1.22

function tierBoost(
  miles: number | null,
  tiers: readonly { maxMiles: number; boost: number; label: string }[],
): { multiplier: number; label: string | null } {
  if (miles == null) return { multiplier: 1, label: null }
  for (const tier of tiers) {
    if (miles <= tier.maxMiles) {
      return { multiplier: 1 + tier.boost, label: tier.label }
    }
  }
  return { multiplier: 1, label: null }
}

function townCenterPoint(
  zip: string | null,
  town: TmreTown | null,
): GeoPoint | null {
  if (zip && ZIP_CENTERS[zip]) return ZIP_CENTERS[zip]!
  if (town) return TOWN_CENTERS[town]
  return null
}

/**
 * Location premium for a property based on proximity to water, town/zip center,
 * and golf or country club amenities.
 */
export function computeLocationPremium(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  postalCode?: string | null,
  city?: string | null,
): LocationPremiumFactors {
  const lat = latitude != null ? Number(latitude) : null
  const lon = longitude != null ? Number(longitude) : null

  if (
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return {
      waterMiles: null,
      townCenterMiles: null,
      golfMiles: null,
      waterMultiplier: 1,
      centerMultiplier: 1,
      golfMultiplier: 1,
      combinedMultiplier: 1,
      labels: [],
    }
  }

  const zip = postalCode?.trim().slice(0, 5) ?? null
  const town = townForZip(postalCode) ?? null

  const waterMiles = minDistanceMiles(lat, lon, WATER_ACCESS_POINTS)
  const center = townCenterPoint(zip, town)
  const townCenterMiles = center
    ? haversineMiles(lat, lon, center.lat, center.lon)
    : null

  let golfMiles: number | null = null
  for (const club of GOLF_AMENITIES) {
    const d = haversineMiles(lat, lon, club.lat, club.lon)
    if (golfMiles == null || d < golfMiles) golfMiles = d
  }

  const water = tierBoost(waterMiles, [
    { maxMiles: 0.2, boost: 0.1, label: 'Waterfront or beach proximity' },
    { maxMiles: 0.45, boost: 0.06, label: 'Short walk to water' },
    { maxMiles: 0.85, boost: 0.03, label: 'Near Long Island Sound' },
    { maxMiles: 1.4, boost: 0.015, label: 'Coastal neighborhood' },
  ])

  const centerBoost = tierBoost(townCenterMiles, [
    { maxMiles: 0.6, boost: 0.035, label: 'Central village location' },
    { maxMiles: 1.2, boost: 0.02, label: 'Near town center' },
    { maxMiles: 2.0, boost: 0.01, label: 'Established in-town area' },
  ])

  const golf = tierBoost(golfMiles, [
    { maxMiles: 0.35, boost: 0.05, label: 'Adjacent to golf or country club' },
    { maxMiles: 0.75, boost: 0.03, label: 'Near golf course' },
    { maxMiles: 1.25, boost: 0.015, label: 'Country club neighborhood' },
  ])

  const labels = [water.label, centerBoost.label, golf.label].filter(
    (label): label is string => label != null,
  )

  const rawCombined =
    water.multiplier * centerBoost.multiplier * golf.multiplier
  const combinedMultiplier = Math.min(rawCombined, MAX_COMBINED_MULTIPLIER)

  return {
    waterMiles,
    townCenterMiles,
    golfMiles,
    waterMultiplier: water.multiplier,
    centerMultiplier: centerBoost.multiplier,
    golfMultiplier: golf.multiplier,
    combinedMultiplier,
    labels,
  }
}

/** Human-readable premium note from label list. */
export function formatLocationPremiumLabels(labels: string[]): string | null {
  if (labels.length === 0) return null
  if (labels.length === 1) return labels[0]!
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}
