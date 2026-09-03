/** sync_meta key — admin flip for location-estimate outlines on maps. */
export const LOCATION_ESTIMATE_MAP_OVERLAY_KEY = 'location_estimate_map_overlay'

/** Browser event after Admin (or the map chip) writes the flag. */
export const LOCATION_ESTIMATE_OVERLAY_CHANGED_EVENT =
  'tmre:location-estimate-overlay'

/** Missing key means on — admin is looking for the outlines. Explicit `0` turns them off. */
export function parseLocationEstimateMapOverlay(
  raw: string | null | undefined,
): boolean {
  if (raw == null || raw === '') return true
  return raw !== '0' && raw !== 'false'
}
