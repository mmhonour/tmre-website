import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  LOCATION_ESTIMATE_MAP_OVERLAY_KEY,
  parseLocationEstimateMapOverlay,
} from '@/lib/location-estimate-map-overlay-shared'

export { LOCATION_ESTIMATE_MAP_OVERLAY_KEY } from '@/lib/location-estimate-map-overlay-shared'

export function getLocationEstimateMapOverlay(): boolean {
  return parseLocationEstimateMapOverlay(
    getSyncMeta(LOCATION_ESTIMATE_MAP_OVERLAY_KEY),
  )
}

export async function getLocationEstimateMapOverlayFresh(): Promise<boolean> {
  try {
    return parseLocationEstimateMapOverlay(
      await getSyncMetaFresh(LOCATION_ESTIMATE_MAP_OVERLAY_KEY),
    )
  } catch {
    return getLocationEstimateMapOverlay()
  }
}

export async function setLocationEstimateMapOverlay(
  enabled: boolean,
): Promise<boolean> {
  await setSyncMetaDurable(
    LOCATION_ESTIMATE_MAP_OVERLAY_KEY,
    enabled ? '1' : '0',
  )
  return enabled
}
