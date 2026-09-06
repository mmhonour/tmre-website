import { TOWN_CENTERS } from '@/lib/tmre-geo'
import { TMRE_TOWNS, isTmreTown, type TmreTown } from '@/lib/tmre-towns'
import { TOWN_CENTER_RADIUS_MILES, milesBetween } from '@/lib/location-estimate-zip-grid-shared'

export const LOCATION_ESTIMATE_TOWN_CENTERS_KEY = 'location_estimate_town_centers'
export const LOCATION_ESTIMATE_TOWN_CENTERS_CHANGED_EVENT =
  'tmre:location-estimate-town-centers'

export const TOWN_CENTER_RADIUS_MIN_MILES = 0.1
export const TOWN_CENTER_RADIUS_MAX_MILES = 2
export const TOWN_CENTER_RADIUS_STEP_MILES = 0.05

export type TownCenterPlacement = {
  lat: number
  lon: number
  radiusMiles: number
}

export type TownCenterPlacements = Partial<Record<TmreTown, TownCenterPlacement>>

export type TownCentersPayload = {
  version: 1
  placements: TownCenterPlacements
}

export function clampTownCenterRadius(miles: number): number {
  if (!Number.isFinite(miles)) return TOWN_CENTER_RADIUS_MILES
  const stepped =
    Math.round(miles / TOWN_CENTER_RADIUS_STEP_MILES) *
    TOWN_CENTER_RADIUS_STEP_MILES
  const rounded = Math.round(stepped * 100) / 100
  return Math.min(
    TOWN_CENTER_RADIUS_MAX_MILES,
    Math.max(TOWN_CENTER_RADIUS_MIN_MILES, rounded),
  )
}

export function defaultTownCenter(town: TmreTown): TownCenterPlacement {
  const pt = TOWN_CENTERS[town]
  return {
    lat: pt.lat,
    lon: pt.lon,
    radiusMiles: TOWN_CENTER_RADIUS_MILES,
  }
}

export function resolveTownCenter(
  town: TmreTown,
  placements: TownCenterPlacements = {},
): TownCenterPlacement {
  const fallback = defaultTownCenter(town)
  const over = placements[town]
  if (!over) return fallback
  return {
    lat: Number.isFinite(over.lat) ? over.lat : fallback.lat,
    lon: Number.isFinite(over.lon) ? over.lon : fallback.lon,
    radiusMiles: clampTownCenterRadius(over.radiusMiles),
  }
}

export function resolveAllTownCenters(
  placements: TownCenterPlacements = {},
): Record<TmreTown, TownCenterPlacement> {
  const out = {} as Record<TmreTown, TownCenterPlacement>
  for (const town of TMRE_TOWNS) out[town] = resolveTownCenter(town, placements)
  return out
}

export function parseTownCenterPlacement(
  value: unknown,
): TownCenterPlacement | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { lat?: unknown; lon?: unknown; radiusMiles?: unknown }
  if (typeof raw.lat !== 'number' || !Number.isFinite(raw.lat)) return null
  if (typeof raw.lon !== 'number' || !Number.isFinite(raw.lon)) return null
  if (raw.lat < 40.5 || raw.lat > 42.2) return null
  if (raw.lon < -74.2 || raw.lon > -71.7) return null
  const radiusMiles =
    typeof raw.radiusMiles === 'number'
      ? clampTownCenterRadius(raw.radiusMiles)
      : TOWN_CENTER_RADIUS_MILES
  return { lat: raw.lat, lon: raw.lon, radiusMiles }
}

export function parseTownCentersPayload(
  raw: string | null | undefined,
): TownCentersPayload {
  if (!raw) return { version: 1, placements: {} }
  try {
    const parsed = JSON.parse(raw) as { placements?: unknown }
    const placements: TownCenterPlacements = {}
    if (parsed.placements && typeof parsed.placements === 'object') {
      for (const [town, value] of Object.entries(parsed.placements)) {
        if (!isTmreTown(town)) continue
        const placement = parseTownCenterPlacement(value)
        if (placement) placements[town] = placement
      }
    }
    return { version: 1, placements }
  } catch {
    return { version: 1, placements: {} }
  }
}

export function mergeTownCenterPlacement(
  current: TownCenterPlacements,
  town: TmreTown,
  next: TownCenterPlacement,
): TownCenterPlacements {
  return { ...current, [town]: next }
}

/** Which town-center disk contains this point, if any. */
export function townCenterOwningAt(
  lat: number,
  lon: number,
  placements: TownCenterPlacements = {},
): TmreTown | null {
  let best: { town: TmreTown; miles: number } | null = null
  for (const town of TMRE_TOWNS) {
    const pt = resolveTownCenter(town, placements)
    const miles = milesBetween(pt, { lat, lon })
    if (miles <= pt.radiusMiles && (!best || miles < best.miles)) {
      best = { town, miles }
    }
  }
  return best?.town ?? null
}
