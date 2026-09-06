import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  LOCATION_ESTIMATE_TOWN_CENTERS_KEY,
  mergeTownCenterPlacement,
  parseTownCentersPayload,
  type TownCenterPlacement,
  type TownCentersPayload,
} from '@/lib/location-estimate-town-centers-shared'
import type { TmreTown } from '@/lib/tmre-towns'

export { LOCATION_ESTIMATE_TOWN_CENTERS_KEY } from '@/lib/location-estimate-town-centers-shared'

export function getLocationEstimateTownCenters(): TownCentersPayload {
  return parseTownCentersPayload(
    getSyncMeta(LOCATION_ESTIMATE_TOWN_CENTERS_KEY),
  )
}

export async function getLocationEstimateTownCentersFresh(): Promise<TownCentersPayload> {
  try {
    return parseTownCentersPayload(
      await getSyncMetaFresh(LOCATION_ESTIMATE_TOWN_CENTERS_KEY),
    )
  } catch {
    return getLocationEstimateTownCenters()
  }
}

export async function setLocationEstimateTownCenter(
  town: TmreTown,
  placement: TownCenterPlacement,
): Promise<TownCentersPayload> {
  const current = await getLocationEstimateTownCentersFresh()
  const next: TownCentersPayload = {
    version: 1,
    placements: mergeTownCenterPlacement(current.placements, town, placement),
  }
  await setSyncMetaDurable(
    LOCATION_ESTIMATE_TOWN_CENTERS_KEY,
    JSON.stringify(next),
  )
  return next
}

export async function resetLocationEstimateTownCenter(
  town: TmreTown,
): Promise<TownCentersPayload> {
  const current = await getLocationEstimateTownCentersFresh()
  const placements = { ...current.placements }
  delete placements[town]
  const next: TownCentersPayload = { version: 1, placements }
  await setSyncMetaDurable(
    LOCATION_ESTIMATE_TOWN_CENTERS_KEY,
    JSON.stringify(next),
  )
  return next
}
